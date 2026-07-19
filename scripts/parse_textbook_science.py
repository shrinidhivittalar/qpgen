"""
Parse Karnataka Class X Science Textbook (merged PDF) — extract EXERCISES and
in-text QUESTIONS from each chapter.

Output: parsed_output_science_textbook/questions.json
"""

import fitz, re, json, sys
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────
PDF_PATH = Path(r"C:\Users\shrin\Downloads\ilovepdf_merged (7)_compressed.pdf")
OUT_DIR  = Path("parsed_output_science_textbook")
OUT_DIR.mkdir(exist_ok=True)

# PDF page ranges (1-indexed) per chapter
CHAPTERS = [
    (3,  "Metals and Non-metals",                3,   23),
    (4,  "Carbon and its Compounds",             24,  44),
    (7,  "How do Organisms Reproduce?",          45,  59),
    (8,  "Heredity",                             60,  65),
    (9,  "Light – Reflection and Refraction",    66,  92),
    (10, "The Human Eye and the Colourful World",93, 102),
    (13, "Our Environment",                     103, 110),
]

# Regex patterns
EXERCISES_RE = re.compile(r'E\s*X\s*E\s*R\s*C\s*I\s*S\s*E\s*S')
QUESTIONS_RE = re.compile(r'Q\s*U\s*E\s*S\s*T\s*I\s*O\s*N\s*S\s*\?')
Q_NUM_RE     = re.compile(r'(?m)(?=^\d{1,2}\.\s)')
OPTION_RE    = re.compile(r'\(([a-d])\)\s*\n\s*', re.IGNORECASE)
HDR_RE       = re.compile(
    r'^(Science|What you have learnt|NOT TO BE REPUBLISHED|@KTBS|Answers?)\s*$',
    re.MULTILINE | re.IGNORECASE
)
PAGE_NUM_RE  = re.compile(r'^\d{1,3}\s*$', re.MULTILINE)

# ── Helpers ──────────────────────────────────────────────────────────────────

def safe_print(*args):
    try:
        print(*args)
    except UnicodeEncodeError:
        print(*(str(a).encode('ascii', 'replace').decode() for a in args))


def clean_block(text: str) -> str:
    """Remove running headers/footers and page numbers from a text block."""
    text = HDR_RE.sub('', text)
    text = PAGE_NUM_RE.sub('', text)
    # Collapse 3+ consecutive newlines to 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def normalize_question(text: str) -> str:
    """Join MCQ option labels with their text, strip leading number."""
    text = re.sub(r'^\d{1,2}\.\s*', '', text.strip())
    text = OPTION_RE.sub(r'(\1) ', text)
    return text.strip()


def is_mcq(text: str) -> bool:
    return bool(re.search(r'\(a\)', text, re.IGNORECASE))


def extract_questions_from_block(text: str, ch_num: int, section: str,
                                  counter: list) -> list:
    """
    Split a block of exercise/questions text into individual questions.
    counter is a mutable [int] so we can keep a running global count.
    """
    # Split on question number boundaries
    chunks = re.split(Q_NUM_RE, text)
    results = []

    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        # Must start with a digit
        if not re.match(r'^\d{1,2}\.', chunk):
            continue
        # Ignore very short chunks (likely stray numbers)
        if len(chunk) < 10:
            continue

        q_text = normalize_question(chunk)
        if not q_text or len(q_text) < 8:
            continue

        counter[0] += 1
        qid = f"TB_CH{ch_num:02d}_{section[0].upper()}{counter[0]:02d}"

        results.append({
            "qid":        qid,
            "number":     counter[0],
            "text":       q_text,
            "type":       "mcq" if is_mcq(q_text) else "text",
            "has_figure": False,
            "has_table":  False,
            "images":     [],
            "tables":     [],
            "source":     "textbook",
            "chapter":    f"Chapter {ch_num}",
            "chapter_num": ch_num,
            "section":    section,
        })

    return results


def get_chapter_text(doc, start_pg: int, end_pg: int) -> str:
    """Concatenate all page text for a chapter range (1-indexed pages)."""
    parts = []
    for pg in range(start_pg, end_pg + 1):
        parts.append(doc[pg - 1].get_text("text"))
    return clean_block("\n".join(parts))


# ── Main ─────────────────────────────────────────────────────────────────────

def parse(pdf_path: Path) -> dict:
    doc = fitz.open(str(pdf_path))
    safe_print(f"Opened: {pdf_path.name}  ({len(doc)} pages)")

    all_questions: dict = {}

    for ch_num, ch_name, start_pg, end_pg in CHAPTERS:
        safe_print(f"\nChapter {ch_num}: {ch_name}  (PDF pp {start_pg}-{end_pg})")
        full_text = get_chapter_text(doc, start_pg, end_pg)

        ex_counter  = [0]   # exercises counter
        inq_counter = [0]   # in-text questions counter

        # ── EXERCISES section ────────────────────────────────────────────────
        ex_match = EXERCISES_RE.search(full_text)
        if ex_match:
            ex_text = full_text[ex_match.end():]
            # Cut off at "Answers" or next chapter marker
            cut = re.search(r'\n(Answers?|CHAPTER)\b', ex_text, re.IGNORECASE)
            if cut:
                ex_text = ex_text[:cut.start()]
            qs = extract_questions_from_block(ex_text, ch_num, "exercises", ex_counter)
            safe_print(f"  EXERCISES: {len(qs)} questions")
            for q in qs:
                all_questions[q["qid"]] = q
        else:
            safe_print(f"  EXERCISES: not found")

        # ── In-text QUESTIONS sections ───────────────────────────────────────
        inq_total = 0
        pos = 0
        while True:
            m = QUESTIONS_RE.search(full_text, pos)
            if not m:
                break
            inq_text = full_text[m.end():]
            # Cut at next QUESTIONS block, EXERCISES, or "What you have learnt"
            cut = re.search(
                r'\n(Q\s*U\s*E\s*S\s*T\s*I\s*O\s*N|E\s*X\s*E\s*R\s*C\s*I|What you have learnt)',
                inq_text
            )
            if cut:
                inq_text = inq_text[:cut.start()]
            qs = extract_questions_from_block(inq_text, ch_num, "in_text", inq_counter)
            for q in qs:
                all_questions[q["qid"]] = q
            inq_total += len(qs)
            pos = m.end()

        if inq_total:
            safe_print(f"  In-text QUESTIONS: {inq_total} questions")

    safe_print(f"\nTotal: {len(all_questions)} questions extracted")
    return all_questions


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    questions = parse(PDF_PATH)

    out_path = OUT_DIR / "questions.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)
    safe_print(f"\nSaved -> {out_path}")
