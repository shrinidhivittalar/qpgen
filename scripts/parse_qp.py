"""
Question Paper Parser
Extracts text questions and image-based questions from SSLC PDF question papers.
"""

import fitz  # PyMuPDF
import json
import re
import os


PDF_PATH = r"D:\Internship\qpgenerator\SSLC2025_2026_QP - 83E_MQP_1.pdf"
OUTPUT_DIR = r"D:\Internship\qpgenerator\parsed_output"
IMAGES_DIR = os.path.join(OUTPUT_DIR, "images")


def setup_dirs():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(IMAGES_DIR, exist_ok=True)


# Matches a question number at the START of a string: "4.", "14.", "38."
# Allows optional whitespace/newline after the dot (including end-of-string)
Q_NUM_RE = re.compile(r"^(\d{1,2})\.(\s|$)")

# A "PART" or Roman-numeral section header: "PART – A", "I.", "VI.", etc.
SECTION_HDR_RE = re.compile(r"^(PART\s*[–\-]\s*[A-Z]|[IVX]{1,4}\.\s)")

# Page header like "3\n83-E" or "12\n83-E" — always the first block on each page
PAGE_HDR_RE = re.compile(r"^\d{1,2}\s*\n?\s*83-E")

# "General Instructions" block on the cover page — everything before real questions
INSTRUCTIONS_SENTINEL = "General Instructions to the Candidate"


def split_by_question_numbers(text):
    """
    Split a multi-question text block into segments.
    E.g. "13. foo\n14. bar" -> [("13", "13. foo"), ("14", "14. bar")]
    Returns [(q_num_str_or_None, segment_text), ...]
    """
    # Find all positions where a new question number starts (after a newline or start)
    parts = re.split(r"(?m)(?=^\d{1,2}\.\s)", text)
    result = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        m = Q_NUM_RE.match(part)
        if m:
            result.append((int(m.group(1)), part))
        else:
            result.append((None, part))
    return result


def get_text_y_ranges(page):
    """Return sorted list of (y_top, y_bottom) for every non-empty text block."""
    ranges = []
    for b in page.get_text("blocks"):
        x0, y0, x1, y1, text, _, block_type = b
        if block_type == 0 and text.strip():
            ranges.append((y0, y1))
    ranges.sort()
    return ranges


def figure_region_for_image(page, img_y, text_ranges):
    """
    Given an image's top y-coord and all text block y-ranges on the page,
    return the full figure region rect: from the bottom of the last text block
    ABOVE the image to the top of the first text block BELOW it.
    This captures both raster images AND surrounding vector graphics.
    """
    page_rect = page.rect
    margin_x = 36  # ~0.5 inch left/right margin trim

    gap_top = page_rect.y0
    gap_bottom = page_rect.y1

    for (y0, y1) in text_ranges:
        if y1 <= img_y:          # block is above the image
            gap_top = max(gap_top, y1)
        elif y0 > img_y:         # block is below the image
            gap_bottom = min(gap_bottom, y0)
            break

    return fitz.Rect(
        page_rect.x0 + margin_x,
        gap_top,
        page_rect.x1 - margin_x,
        gap_bottom,
    )


def extract_page_content(page):
    """
    Returns content blocks sorted by y position.
    Each block: {"type": "text"|"image", "y": float, "text"?: str, ...image fields...}
    Image blocks carry a pre-computed `figure_rect` for full-figure rendering.
    """
    text_ranges = get_text_y_ranges(page)
    blocks = []

    for b in page.get_text("blocks"):
        x0, y0, x1, y1, text, block_no, block_type = b
        if block_type != 0:
            continue
        stripped = text.strip()
        if stripped:
            blocks.append({"type": "text", "y": y0, "text": stripped})

    seen_figure_rects = set()  # deduplicate: one figure per gap region
    for img_info in page.get_image_info(xrefs=True):
        bbox = img_info["bbox"]
        img_y = bbox[1]
        fig_rect = figure_region_for_image(page, img_y, text_ranges)
        key = (round(fig_rect.y0), round(fig_rect.y1))
        if key in seen_figure_rects:
            continue  # same gap already registered (multiple images in one figure)
        seen_figure_rects.add(key)
        blocks.append({
            "type": "image",
            "y": img_y,
            "figure_rect": fig_rect,
            "width": img_info["width"],
            "height": img_info["height"],
        })

    blocks.sort(key=lambda b: b["y"])
    return blocks


def save_image(page, block, label):
    """
    Render the full figure region (text gap) at high DPI so both raster images
    and surrounding vector graphics (wires, labels, arrows) are captured.
    """
    try:
        pix = page.get_pixmap(clip=block["figure_rect"], dpi=150)
        filename = f"{label}.png"
        filepath = os.path.join(IMAGES_DIR, filename)
        pix.save(filepath)
        return filename
    except Exception:
        return None


FIGURE_KEYWORDS = re.compile(
    r"\b(figure|fig|diagram|graph|table|circuit|image|observe|shown|given below|above)\b",
    re.IGNORECASE,
)


def new_question(num):
    return {
        "qid": f"Q{num:02d}",
        "number": num,
        "text": "",
        "images": [],
        "has_figure": False,
    }


def parse_questions(doc):
    questions = {}
    manifest = []          # flat list of {fid, qid, question_number, page, file, ...}
    current_q = None
    questions_started = False
    # per-question figure counter: {q_num: count}
    fig_counters = {}
    orphan_images = []     # images encountered when current_q is None

    def add_text_to_current(text):
        if current_q is not None and text:
            questions[current_q]["text"] += text + "\n"

    def handle_image_block(block, page_num, page):
        if current_q is None:
            orphan_images.append({"page": page_num + 1, "bbox": list(block["figure_rect"])})
            return
        fig_counters[current_q] = fig_counters.get(current_q, 0) + 1
        fig_num = fig_counters[current_q]
        qid = questions[current_q]["qid"]
        fid = f"{qid}_F{fig_num}"          # e.g. Q04_F1
        filename = save_image(page, block, fid)
        if filename:
            fig = block["figure_rect"]
            entry = {
                "fid": fid,
                "file": filename,
                "width": round(fig.width),
                "height": round(fig.height),
            }
            questions[current_q]["images"].append(entry)
            questions[current_q]["has_figure"] = True
            manifest.append({
                "fid": fid,
                "qid": qid,
                "question_number": current_q,
                "page": page_num + 1,
                "file": filename,
                "width": round(fig.width),
                "height": round(fig.height),
                "question_text_snippet": "",  # filled in after parsing
            })

    for page_num in range(doc.page_count):
        page = doc[page_num]
        blocks = extract_page_content(page)

        for block in blocks:
            if block["type"] == "image":
                if questions_started:
                    handle_image_block(block, page_num, page)
                continue

            text = block["text"]

            # Skip page headers ("3\n83-E")
            if PAGE_HDR_RE.match(text):
                continue

            # Detect the end of the cover/instructions section
            if not questions_started:
                if INSTRUCTIONS_SENTINEL in text:
                    # Still on instructions page; mark that we've seen it
                    continue
                # The instructions are numbered 1-5 — skip them
                if Q_NUM_RE.match(text):
                    # Check if this could be an instruction (low number, no subject matter)
                    # We skip all numbered items until we see "PART –" header
                    continue
                if SECTION_HDR_RE.match(text) and text.startswith("PART"):
                    # Real content starts here
                    questions_started = True
                continue

            # Skip section headers in the body (PART – B, III., etc.)
            if SECTION_HDR_RE.match(text):
                continue

            # The text block may contain one or more question starts
            # Split it so we can handle "13. foo\n14. bar" correctly
            segments = split_by_question_numbers(text)

            for q_num, segment in segments:
                if q_num is not None:
                    current_q = q_num
                    if current_q not in questions:
                        questions[current_q] = new_question(current_q)
                    questions[current_q]["text"] += segment + "\n"
                else:
                    add_text_to_current(segment)

    # Clean up text and backfill manifest snippets
    for q in questions.values():
        q["text"] = re.sub(r"\n{3,}", "\n\n", q["text"]).strip()
    for entry in manifest:
        q = questions.get(entry["question_number"])
        entry["question_text_snippet"] = (q["text"][:120].replace("\n", " ") if q else "")
        entry["keyword_match"] = bool(FIGURE_KEYWORDS.search(q["text"]) if q else False)

    return questions, manifest, orphan_images


def classify_question(q):
    text = q["text"]
    text_lower = text.lower()
    if q["has_figure"]:
        return "figure_based"
    if re.search(r"\(A\).*\(B\)", text, re.DOTALL):
        return "mcq"
    if re.search(r"\ba\)\s|\bi\)\s", text_lower):
        return "multi_part"
    return "text"


def main():
    setup_dirs()
    doc = fitz.open(PDF_PATH)
    print(f"Parsing {doc.page_count} pages from: {os.path.basename(PDF_PATH)}\n")

    questions, manifest, orphan_images = parse_questions(doc)

    for q in questions.values():
        q["type"] = classify_question(q)

    sorted_questions = dict(sorted(questions.items()))

    total     = len(sorted_questions)
    with_imgs = sum(1 for q in sorted_questions.values() if q["has_figure"])
    mcq       = sum(1 for q in sorted_questions.values() if q["type"] == "mcq")
    multi     = sum(1 for q in sorted_questions.values() if q["type"] == "multi_part")
    text_only = sum(1 for q in sorted_questions.values() if q["type"] == "text")

    print(f"{'='*60}")
    print(f"Total questions parsed : {total}")
    print(f"  MCQ                  : {mcq}")
    print(f"  Multi-part           : {multi}")
    print(f"  Text / short answer  : {text_only}")
    print(f"  Figure-based         : {with_imgs}")
    print(f"{'='*60}\n")

    for num, q in sorted_questions.items():
        img_tag = f" [{len(q['images'])} img]" if q["images"] else ""
        preview = q["text"][:90].replace("\n", " ")
        print(f"  Q{num:2d} [{q['type']:<14}]{img_tag}  {preview}...")

    # --- Manifest summary ---
    print(f"\n{'='*60}")
    print("Figure-to-question manifest:")
    for entry in manifest:
        kw = "[keyword match]" if entry["keyword_match"] else "[NO keyword match -- CHECK]"
        print(f"  {entry['fid']}  ->  {entry['file']}  (page {entry['page']})  {kw}")
        print(f"          Q: {entry['question_text_snippet'][:80]}...")

    # --- Cross-validation warnings ---
    warnings = []
    for entry in manifest:
        if not entry["keyword_match"]:
            warnings.append(
                f"  WARNING: {entry['fid']} linked to Q{entry['question_number']} "
                f"but question text has no figure keyword. Possible mismatch."
            )
    if orphan_images:
        for o in orphan_images:
            warnings.append(f"  WARNING: Orphan image on page {o['page']} — not linked to any question.")

    if warnings:
        print(f"\n{'='*60}")
        print("VALIDATION WARNINGS:")
        for w in warnings:
            print(w)
    else:
        print("\nValidation: all figures have keyword matches. No issues found.")

    # --- Save outputs ---
    questions_path = os.path.join(OUTPUT_DIR, "questions.json")
    manifest_path  = os.path.join(OUTPUT_DIR, "manifest.json")

    with open(questions_path, "w", encoding="utf-8") as f:
        json.dump(sorted_questions, f, ensure_ascii=False, indent=2)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\nQuestions -> {questions_path}")
    print(f"Manifest  -> {manifest_path}")
    print(f"Images    -> {IMAGES_DIR}")
    doc.close()


if __name__ == "__main__":
    main()
