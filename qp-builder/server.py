from flask import Flask, jsonify, request, send_file
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
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024  # 20 MB upload limit
CORS(app)

BASE = Path(__file__).parent.parent

# ── MongoDB ───────────────────────────────────────────────────────────────────
_mongo      = MongoClient(os.getenv("MONGODB_URI"))
_db         = _mongo["qp_builder"]
qs_col      = _db["questions"]   # static question banks
uploads_col = _db["uploads"]     # user-uploaded papers

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL       = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

# ── Supabase (optional — image upload skipped if not configured) ──────────────
try:
    from supabase import create_client as _sb_create
    _supabase = _sb_create(
        os.getenv("SUPABASE_URL", ""),
        os.getenv("SUPABASE_SERVICE_KEY", ""),
    ) if os.getenv("SUPABASE_URL") else None
except Exception:
    _supabase = None

SUPABASE_BUCKET = "QPGen-images"
_IMG_MIME = {"png": "image/png", "jpeg": "image/jpeg", "jpg": "image/jpeg", "gif": "image/gif"}
MIN_IMG_PX = 80   # skip decorative images / icons smaller than this

# ── Parse prompts (paper-type hints) ─────────────────────────────────────────

LATEX_RULE = (
    "Math/chemistry: use LaTeX inline — $\\ce{H2SO4}$ for chemical formulas, "
    "$\\ce{A + B -> C}$ for reactions, $\\frac{1}{2}$ for fractions, "
    "$x^2$ for powers, $\\sqrt{x}$ for roots. Plain text otherwise."
)

PARSE_PROMPTS: dict[str, str] = {
    "sslc_qp": f"""\
Extract questions from this Karnataka SSLC question paper. Return ONLY a JSON array.
Each item: {{"number":<int>,"text":<full question>,"type":"mcq"|"figure_based"|"text","options":null|["A","B","C","D"]}}
Rules: mcq=has A/B/C/D options; figure_based=mentions figure/diagram/circuit/graph; text=everything else.
Karnataka SSLC papers have ~40 questions split into parts A/B/C/D or sections I-VI.
Skip page headers (83-E, 81-E, etc.), footers, and general instructions. Keep original question wording.
{LATEX_RULE}

Text:
""",
    "textbook": f"""\
Extract exercise and in-text questions from this textbook passage. Return ONLY a JSON array.
Each item: {{"number":<int>,"text":<full question>,"type":"mcq"|"figure_based"|"text","options":null|["A","B","C","D"]}}
Rules: mcq=has multiple-choice options; figure_based=mentions figure/diagram; text=everything else.
Look for sections labelled Exercises, Questions, Activities, or Think and Discuss.
Skip chapter titles, body text, and explanations — only questions.
{LATEX_RULE}

Text:
""",
    "generic": f"""\
Extract exam questions from the text. Return ONLY a JSON array, no other text.
Each item: {{"number":<int>,"text":<full question>,"type":"mcq"|"figure_based"|"text","options":null|["A","B","C","D"]}}
Rules: mcq=has A/B/C/D options; figure_based=mentions figure/diagram; text=everything else.
Skip headers/footers/instructions. Keep original wording.
{LATEX_RULE}

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
            try:
                num = int(item.get("number") or 0)
            except (ValueError, TypeError):
                num = 0
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


# ── Image extraction helpers ──────────────────────────────────────────────────

# Matches lines like "6.", "6)", "Q6.", "Q.6" at the start of a text block
_Q_NUM_RE = re.compile(r'^\s*(?:Q\.?\s*)?(\d{1,2})\s*[\.\)]\s*\S', re.IGNORECASE)

FIGURE_DPI    = 150   # render resolution for figure clips
MARGIN_X      = 36    # ~0.5 inch left/right trim when clipping figure regions


def _text_y_ranges(page) -> list[tuple[float, float]]:
    """Sorted (y_top, y_bottom) for every non-empty text block on the page."""
    ranges = []
    for b in page.get_text("blocks"):
        x0, y0, x1, y1, text, _, block_type = b
        if block_type == 0 and text.strip():
            ranges.append((y0, y1))
    ranges.sort()
    return ranges


def _figure_region(page, img_y: float, text_ranges: list) -> fitz.Rect:
    """
    Return a clip rect spanning from the bottom of the last text block above
    the image to the top of the first text block below it.
    Rendering this region at FIGURE_DPI captures both raster images AND
    vector graphics (geometry lines, axes, circuit paths) in that gap.
    """
    pr        = page.rect
    gap_top   = pr.y0
    gap_bottom = pr.y1

    for y0, y1 in text_ranges:
        if y1 <= img_y:
            gap_top = max(gap_top, y1)
        elif y0 > img_y:
            gap_bottom = min(gap_bottom, y0)
            break

    return fitz.Rect(pr.x0 + MARGIN_X, gap_top, pr.x1 - MARGIN_X, gap_bottom)


def extract_layout_items(doc) -> list[dict]:
    """
    Return text and image items in reading order across all pages.

    Images are extracted via page.get_image_info() + figure-region rendering
    (page.get_pixmap with a clip rect at FIGURE_DPI). This captures both
    embedded raster images and surrounding vector graphics (geometry, circuits,
    graph axes) that the get_text("dict") type=1 approach would miss entirely.
    """
    items: list[dict] = []

    for page in doc:
        text_ranges = _text_y_ranges(page)
        page_blocks: list[dict] = []

        # ── text blocks ──────────────────────────────────────────────────────
        for b in page.get_text("blocks"):
            x0, y0, x1, y1, text, _, block_type = b
            if block_type == 0:
                stripped = text.strip()
                if stripped:
                    page_blocks.append({"type": "text", "y": y0, "text": stripped})

        # ── image blocks (rendered as figure-region clips) ───────────────────
        seen: set[tuple[int, int]] = set()
        for img_info in page.get_image_info(xrefs=True):
            bbox  = img_info["bbox"]
            img_y = bbox[1]
            w     = img_info["width"]
            h     = img_info["height"]
            if w < MIN_IMG_PX or h < MIN_IMG_PX:
                continue
            clip = _figure_region(page, img_y, text_ranges)
            key  = (round(clip.y0), round(clip.y1))
            if key in seen:
                continue  # two images in same gap → render once
            seen.add(key)
            try:
                pix  = page.get_pixmap(clip=clip, dpi=FIGURE_DPI)
                data = pix.tobytes("png")
                page_blocks.append({
                    "type": "image",
                    "y":    img_y,
                    "data": data,
                    "ext":  "png",
                    "w":    pix.width,
                    "h":    pix.height,
                })
            except Exception:
                continue

        # sort all blocks on this page by vertical position
        page_blocks.sort(key=lambda b: b["y"])
        for b in page_blocks:
            if b["type"] == "text":
                items.append({"type": "text", "text": b["text"]})
            else:
                items.append({"type": "image", "data": b["data"],
                               "ext": b["ext"], "w": b["w"], "h": b["h"]})

    return items


def assign_images_to_questions(layout_items: list[dict], questions: list[dict]) -> dict[int, list[dict]]:
    """
    Walk layout items in order. When a text block opens a new question number,
    subsequent images are assigned to that question until the next question starts.
    """
    q_nums     = {q["number"] for q in questions}
    image_map: dict[int, list[dict]] = {q["number"]: [] for q in questions}
    current_q: int | None = None

    for item in layout_items:
        if item["type"] == "text":
            m = _Q_NUM_RE.match(item["text"])
            if m:
                num = int(m.group(1))
                if num in q_nums:
                    current_q = num
        elif item["type"] == "image" and current_q is not None:
            image_map[current_q].append(item)

    return image_map


def upload_question_images(upload_id: str, image_map: dict[int, list[dict]]) -> dict[int, list[dict]]:
    """
    Upload per-question images to Supabase under uploaded/<upload_id>/.
    Returns {q_num: [{fid, file}]} with only questions that have images.
    Gracefully skips if Supabase is not configured or upload fails.
    """
    if not _supabase:
        return {}

    result: dict[int, list[dict]] = {}
    for q_num, images in image_map.items():
        if not images:
            continue
        refs: list[dict] = []
        for idx, img in enumerate(images):
            ext      = img["ext"]
            filename = f"Q{q_num:02d}_{idx + 1}.{ext}"
            path     = f"uploaded/{upload_id}/{filename}"
            try:
                _supabase.storage.from_(SUPABASE_BUCKET).upload(
                    path=path,
                    file=img["data"],
                    file_options={
                        "content-type": _IMG_MIME.get(ext, "image/png"),
                        "upsert": "true",
                    },
                )
                refs.append({"fid": f"Q{q_num:02d}_{idx + 1}", "file": filename})
            except Exception as e:
                print(f"  [image upload] Q{q_num} img{idx + 1}: {e}")
        if refs:
            result[q_num] = refs

    return result


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

        doc          = fitz.open(tmp.name)
        layout_items = extract_layout_items(doc)
        n_pages      = doc.page_count
        doc.close()

        full_text = "\n".join(i["text"] for i in layout_items if i["type"] == "text")
        avg_chars = len(full_text) / max(n_pages, 1)

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

        # Generate upload_id at parse time so image paths are consistent at confirm time
        upload_id = uuid.uuid4().hex[:8]

        # Assign images to questions by layout position, then upload to Supabase
        image_map  = assign_images_to_questions(layout_items, raw_questions)
        image_refs = upload_question_images(upload_id, image_map)

        # Attach image refs to raw questions
        for q in raw_questions:
            q["images"] = image_refs.get(q["number"], [])

        img_count = sum(len(v) for v in image_refs.values())
        if img_count:
            warnings = [f"{img_count} figure(s) extracted and attached."] + warnings

        return jsonify({
            "upload_id": upload_id,
            "name":      name,
            "raw":       raw_questions,
            "warnings":  warnings,
        })

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
    upload_id = (data.get("upload_id") or "").strip() or uuid.uuid4().hex[:8]

    if not name:
        return jsonify({"error": "name required"}), 400
    if not raw_items:
        return jsonify({"error": "questions required"}), 400

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
        options = item.get("options")
        if not isinstance(options, list):
            options = None
        raw_images = item.get("images") or []
        images = [
            {"fid": img["fid"], "file": img["file"], "width": 0, "height": 0}
            for img in raw_images
            if isinstance(img, dict) and img.get("fid") and img.get("file")
        ]
        questions.append({
            "qid":         f"UP_{upload_id}_Q{i + 1:02d}",
            "number":      item.get("number", i + 1),
            "text":        q_text,
            "type":        q_type,
            "options":     options,
            "has_figure":  q_type == "figure_based" or bool(images),
            "has_table":   False,
            "images":      images,
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



# ── Delete an uploaded paper ─────────────────────────────────────────────────

@app.delete("/api/uploads/<upload_id>")
def delete_upload(upload_id):
    result = uploads_col.delete_one({"upload_id": upload_id})
    if result.deleted_count == 0:
        return jsonify({"error": "not found"}), 404
    return jsonify({"ok": True})


# ── Delete a static question source (subject + source) ───────────────────────

@app.delete("/api/questions/<subject>/<source>")
def delete_question_source(subject, source):
    result = qs_col.delete_many({"subject": subject, "source": source})
    return jsonify({"ok": True, "deleted": result.deleted_count})


# ── Edit a single question inside an uploaded paper ───────────────────────────

@app.patch("/api/uploads/<upload_id>/questions/<qid>")
def update_upload_question(upload_id, qid):
    data    = request.get_json(force=True)
    updates = {}

    if "text" in data:
        text = (data["text"] or "").strip()
        if len(text) < 5:
            return jsonify({"error": "text too short"}), 400
        updates["questions.$[q].text"] = text

    if "type" in data:
        q_type = data["type"]
        if q_type not in ("mcq", "figure_based", "text"):
            return jsonify({"error": "invalid type"}), 400
        updates["questions.$[q].type"]       = q_type
        updates["questions.$[q].has_figure"] = q_type == "figure_based"

    if not updates:
        return jsonify({"error": "nothing to update"}), 400

    result = uploads_col.update_one(
        {"upload_id": upload_id},
        {"$set": updates},
        array_filters=[{"q.qid": qid}],
    )
    if result.matched_count == 0:
        return jsonify({"error": "upload not found"}), 404
    return jsonify({"ok": True})


# ── Delete a single question inside an uploaded paper ────────────────────────

@app.delete("/api/uploads/<upload_id>/questions/<qid>")
def delete_upload_question(upload_id, qid):
    result = uploads_col.update_one(
        {"upload_id": upload_id},
        {
            "$pull": {"questions": {"qid": qid}},
            "$inc":  {"question_count": -1},
        },
    )
    if result.matched_count == 0:
        return jsonify({"error": "upload not found"}), 404
    return jsonify({"ok": True})


# ── Rephrase ──────────────────────────────────────────────────────────────────

_LATEX_PRESERVE = (
    "Preserve all LaTeX notation exactly as-is — "
    "keep $\\ce{...}$ for chemical formulas, $...$ for math expressions. "
    "Do not convert them to plain text."
)

REPHRASE_PROMPTS = {
    "mcq": (
        "You are an experienced teacher. Rephrase this multiple choice question. "
        "Reword the question stem AND all four options, but keep the same correct answer. "
        "Return ONLY the rephrased question in this exact format — "
        "question stem on the first line, then each option on its own line as (A) ..., (B) ..., (C) ..., (D) ... "
        f"No explanations, no preamble. {_LATEX_PRESERVE}"
    ),
    "figure_based": (
        "You are an experienced teacher. Rephrase this question which refers to a diagram or figure. "
        "Keep all references to the figure or diagram intact. Use different wording but preserve the exact meaning. "
        f"Return ONLY the rephrased question — no explanations, no preamble. {_LATEX_PRESERVE}"
    ),
    "table_based": (
        "You are an experienced teacher. Rephrase this question which refers to a data table. "
        "Keep all references to the table intact. Use different wording but preserve the exact meaning. "
        f"Return ONLY the rephrased question — no explanations, no preamble. {_LATEX_PRESERVE}"
    ),
    "default": (
        "You are an experienced teacher. Rephrase the exam question below "
        "using different wording while keeping the exact same meaning, "
        "difficulty level, and subject matter. "
        f"Return ONLY the rephrased question — no explanations, no preamble. {_LATEX_PRESERVE}"
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
    return send_file(Path(__file__).parent / "static" / "index.html")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5050))
    print(f"\n  QP Builder API -> http://localhost:{port}/api/subjects")
    print(f"  Frontend dev  -> http://localhost:5174\n")
    app.run(debug=True, port=port, host="0.0.0.0")
