from flask import Flask, jsonify, send_file, request
from flask_cors import CORS
from pathlib import Path
from groq import Groq
from dotenv import load_dotenv
from pymongo import MongoClient
from datetime import datetime, timezone
import fitz  # PyMuPDF
import json, os, re, uuid, tempfile

load_dotenv()

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

BASE = Path(__file__).parent.parent

# ── MongoDB ───────────────────────────────────────────────────────────────────
_mongo      = MongoClient(os.getenv("MONGODB_URI"))
_db         = _mongo["qp_builder"]
qs_col      = _db["questions"]   # static question banks
uploads_col = _db["uploads"]     # user-uploaded papers

# Image directories stay on disk (binary files don't belong in MongoDB)
IMAGE_DIRS: dict[str, dict[str, Path]] = {
    "science": {"qp": BASE / "parsed_output"       / "images"},
    "maths":   {"qp": BASE / "parsed_output_maths" / "images"},
}

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL       = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

# ── Parse prompts (paper-type hints) ─────────────────────────────────────────

PARSE_PROMPTS: dict[str, str] = {
    "sslc_qp": """\
Extract questions from this Karnataka SSLC question paper. Return ONLY a JSON array.
Each item: {"number":<int>,"text":<full question>,"type":"mcq"|"figure_based"|"text","options":null|["A","B","C","D"]}
Rules: mcq=has A/B/C/D options; figure_based=mentions figure/diagram/circuit/graph; text=everything else.
Karnataka SSLC papers have ~40 questions split into parts A/B/C/D or sections I-VI.
Skip page headers (83-E, 81-E, etc.), footers, and general instructions. Keep original question wording.

Text:
""",
    "textbook": """\
Extract exercise and in-text questions from this textbook passage. Return ONLY a JSON array.
Each item: {"number":<int>,"text":<full question>,"type":"mcq"|"figure_based"|"text","options":null|["A","B","C","D"]}
Rules: mcq=has multiple-choice options; figure_based=mentions figure/diagram; text=everything else.
Look for sections labelled Exercises, Questions, Activities, or Think and Discuss.
Skip chapter titles, body text, and explanations — only questions.

Text:
""",
    "generic": """\
Extract exam questions from the text. Return ONLY a JSON array, no other text.
Each item: {"number":<int>,"text":<full question>,"type":"mcq"|"figure_based"|"text","options":null|["A","B","C","D"]}
Rules: mcq=has A/B/C/D options; figure_based=mentions figure/diagram; text=everything else.
Skip headers/footers/instructions. Keep original wording.

Text:
""",
}


# ── Subjects ──────────────────────────────────────────────────────────────────

@app.get("/api/subjects")
def get_subjects():
    # Aggregate unique subject/source combos and their counts from questions collection
    pipeline = [
        {"$group": {
            "_id":   {"subject": "$subject", "source": "$source"},
            "count": {"$sum": 1},
        }}
    ]
    result: dict[str, dict[str, int]] = {}
    for doc in qs_col.aggregate(pipeline):
        subj = doc["_id"]["subject"]
        src  = doc["_id"]["source"]
        result.setdefault(subj, {})[src] = doc["count"]
    return jsonify(result)


# ── Uploaded papers list ──────────────────────────────────────────────────────

@app.get("/api/uploads")
def list_uploads():
    docs = uploads_col.find({}, {"_id": 0, "upload_id": 1, "name": 1, "question_count": 1})
    return jsonify([
        {"id": d["upload_id"], "name": d["name"], "count": d["question_count"]}
        for d in docs
    ])


# ── Rename an uploaded paper ──────────────────────────────────────────────────

@app.patch("/api/uploads/<upload_id>")
def rename_upload(upload_id):
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    uploads_col.update_one({"upload_id": upload_id}, {"$set": {"name": name}})
    return jsonify({"ok": True})


# ── Questions ─────────────────────────────────────────────────────────────────

@app.get("/api/questions/<subject>/<source>")
def get_questions(subject, source):
    if subject == "uploaded":
        doc = uploads_col.find_one({"upload_id": source}, {"_id": 0, "questions": 1})
        return jsonify(doc["questions"] if doc else [])

    qs = list(qs_col.find({"subject": subject, "source": source}, {"_id": 0}))
    return jsonify(qs)


# ── Upload & parse ────────────────────────────────────────────────────────────

FIGURE_HINT_RE = re.compile(
    r'\b(figure|diagram|observe|given figure|following figure|below figure|adjacent|circuit|graph)\b',
    re.IGNORECASE,
)

CHUNK_SIZE = 6000   # chars per Groq call — ~1500 tokens, well under 6k TPM free tier
CHUNK_OVERLAP = 300 # overlap to avoid cutting a question at the boundary


def _call_groq_chunk(text_chunk: str, paper_type: str) -> list[dict]:
    prompt = PARSE_PROMPTS.get(paper_type, PARSE_PROMPTS["generic"])
    resp = groq_client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt + text_chunk}],
        max_tokens=1500,
        temperature=0.05,
    )
    raw = resp.choices[0].message.content.strip()
    m = re.search(r"\[.*\]", raw, re.DOTALL)
    if not m:
        return []
    try:
        return json.loads(m.group())
    except json.JSONDecodeError:
        return []


def parse_paper(full_text: str, paper_type: str) -> tuple[list[dict], list[str]]:
    """
    Parse paper text into raw question list using up to 2 Groq calls.
    Returns (raw_questions, warnings).
    """
    import time

    warnings: list[str] = []

    # Build at most 2 chunks to stay under free-tier TPM
    if len(full_text) <= CHUNK_SIZE:
        chunks = [full_text]
    else:
        chunks = [
            full_text[:CHUNK_SIZE],
            full_text[CHUNK_SIZE - CHUNK_OVERLAP: 2 * CHUNK_SIZE - CHUNK_OVERLAP],
        ]
        if len(full_text) > 2 * CHUNK_SIZE - CHUNK_OVERLAP:
            warnings.append(
                f"Paper is long ({len(full_text)} chars). "
                "Only the first ~12 000 characters were parsed — questions near the end may be missing."
            )

    seen_nums: set[int] = set()
    raw_questions: list[dict] = []

    for i, chunk in enumerate(chunks):
        if not chunk.strip():
            continue
        if i > 0:
            time.sleep(1.5)  # pace calls to respect free-tier TPM
        try:
            items = _call_groq_chunk(chunk, paper_type)
        except Exception as e:
            warnings.append(f"Parse error on section {i + 1}: {str(e)[:120]}")
            continue

        for item in items:
            text = (item.get("text") or "").strip()
            if not text or len(text) < 8:
                continue
            num = int(item.get("number") or 0)
            if num and num in seen_nums:
                continue  # cross-chunk duplicate
            if num:
                seen_nums.add(num)
            q_type = item.get("type", "text")
            if q_type not in ("mcq", "figure_based", "text"):
                q_type = "text"
            if q_type == "text" and FIGURE_HINT_RE.search(text):
                q_type = "figure_based"
            raw_questions.append({
                "number":  num or len(raw_questions) + 1,
                "text":    text,
                "type":    q_type,
                "options": item.get("options"),
            })

    if len(raw_questions) < 3:
        warnings.append(
            f"Only {len(raw_questions)} question(s) extracted — the PDF may be scanned, "
            "in an unusual format, or mostly non-text."
        )

    return raw_questions, warnings


@app.post("/api/upload")
def upload_qp():
    """Parse PDF and return raw questions for user review — does NOT save to DB."""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    f = request.files["file"]
    if not f.filename or not f.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are supported"}), 400

    paper_type = request.form.get("paper_type", "generic")
    if paper_type not in PARSE_PROMPTS:
        paper_type = "generic"

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    try:
        f.save(tmp.name)
        tmp.close()

        doc       = fitz.open(tmp.name)
        pages     = [page.get_text("text") for page in doc]
        doc.close()
        full_text = "\n".join(pages)
        avg_chars = len(full_text) / max(len(pages), 1)

        if avg_chars < 60:
            return jsonify({
                "error": (
                    "This looks like a scanned PDF (very little extractable text). "
                    "Only text-based PDFs are supported."
                )
            }), 422

        name = Path(f.filename).stem
        raw_questions, warnings = parse_paper(full_text, paper_type)

        if not raw_questions:
            return jsonify({"error": "No questions could be extracted from this PDF."}), 422

        return jsonify({"name": name, "raw": raw_questions, "warnings": warnings})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp.name)


@app.post("/api/upload/confirm")
def confirm_upload():
    """Save user-reviewed questions to MongoDB after the review step."""
    data      = request.get_json(force=True)
    name      = (data.get("name") or "").strip()
    raw_items = data.get("questions", [])

    if not name:
        return jsonify({"error": "name required"}), 400
    if not raw_items:
        return jsonify({"error": "questions required"}), 400

    upload_id = uuid.uuid4().hex[:8]
    questions = []
    for i, item in enumerate(raw_items):
        q_text = (item.get("text") or "").strip()
        if not q_text or len(q_text) < 5:
            continue
        q_type = item.get("type", "text")
        if q_type not in ("mcq", "figure_based", "text"):
            q_type = "text"
        if q_type == "text" and FIGURE_HINT_RE.search(q_text):
            q_type = "figure_based"
        questions.append({
            "qid":         f"UP_{upload_id}_Q{i + 1:02d}",
            "number":      item.get("number", i + 1),
            "text":        q_text,
            "type":        q_type,
            "has_figure":  q_type == "figure_based",
            "has_table":   False,
            "images":      [],
            "tables":      [],
            "source":      "uploaded",
            "chapter":     None,
            "chapter_num": None,
            "section":     None,
        })

    if not questions:
        return jsonify({"error": "No valid questions to save"}), 422

    uploads_col.insert_one({
        "upload_id":      upload_id,
        "name":           name,
        "question_count": len(questions),
        "questions":      questions,
        "created_at":     datetime.now(timezone.utc),
    })

    return jsonify({
        "id":        upload_id,
        "name":      name,
        "count":     len(questions),
        "questions": questions,
    })


# ── Images (still served from disk) ──────────────────────────────────────────

@app.get("/api/images/<subject>/<source>/<filename>")
def serve_image(subject, source, filename):
    img_dir = IMAGE_DIRS.get(subject, {}).get(source)
    if not img_dir:
        return ("Not found", 404)
    path = img_dir / filename
    if not path.exists():
        return ("Not found", 404)
    return send_file(str(path))


# ── Rephrase ──────────────────────────────────────────────────────────────────

REPHRASE_PROMPTS = {
    "mcq": (
        "You are an experienced teacher. Rephrase this multiple choice question. "
        "Reword the question stem AND all four options, but keep the same correct answer. "
        "Return ONLY the rephrased question in this exact format — "
        "question stem on the first line, then each option on its own line as (A) ..., (B) ..., (C) ..., (D) ... "
        "No explanations, no preamble."
    ),
    "figure_based": (
        "You are an experienced teacher. Rephrase this question which refers to a diagram or figure. "
        "Keep all references to the figure or diagram intact. Use different wording but preserve the exact meaning. "
        "Return ONLY the rephrased question — no explanations, no preamble."
    ),
    "table_based": (
        "You are an experienced teacher. Rephrase this question which refers to a data table. "
        "Keep all references to the table intact. Use different wording but preserve the exact meaning. "
        "Return ONLY the rephrased question — no explanations, no preamble."
    ),
    "default": (
        "You are an experienced teacher. Rephrase the exam question below "
        "using different wording while keeping the exact same meaning, "
        "difficulty level, and subject matter. "
        "Return ONLY the rephrased question — no explanations, no preamble."
    ),
}


@app.post("/api/rephrase")
def rephrase():
    data  = request.get_json(force=True)
    text  = (data.get("text")  or "").strip()
    qtype = (data.get("type")  or "default").strip()
    if not text:
        return jsonify({"error": "no text"}), 400
    system_prompt = REPHRASE_PROMPTS.get(qtype, REPHRASE_PROMPTS["default"])
    try:
        resp = groq_client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": text},
            ],
            max_tokens=300,
            temperature=0.75,
        )
        return jsonify({"rephrased": resp.choices[0].message.content.strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Static frontend ───────────────────────────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_app(path):
    return send_file("static/index.html")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5050))
    print(f"\n  QP Builder API -> http://localhost:{port}/api/subjects")
    print(f"  Frontend dev  -> http://localhost:5174\n")
    app.run(debug=True, port=port, host="0.0.0.0")
