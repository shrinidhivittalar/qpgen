# /parse-qp — Question Paper PDF Parser

Parse an SSLC question paper PDF and extract all questions (text + images) into structured JSON.

## Usage
```
/parse-qp <pdf_path> [output_dir]
```

## What it does
1. Opens the PDF with PyMuPDF (fitz)
2. Skips the cover/instructions page (detects real content after `PART –` header)
3. For each page, extracts text blocks and image positions sorted by y-coordinate (reading order)
4. Detects question numbers via regex `^\d{1,2}\.(\s|$)` — handles blocks containing multiple question starts
5. **Figure extraction**: instead of extracting the raw raster image (which misses vector graphics like wires, arrows, labels), it renders the full **text-gap region** — the blank area between the preceding and following text blocks — as a pixmap at 150 DPI. This captures both raster images AND vector paths in one shot.
6. Deduplicates figures (multiple raster images within the same figure gap = one saved PNG)
7. Classifies each question: `mcq`, `multi_part`, `text`, `figure_based`
8. Outputs `questions.json` + `images/` folder

## Key design decisions

### Why render the gap region, not just extract the image?
PDF figures are often a mix of raster images + vector paths (e.g. a solenoid coil stored as a JPEG, surrounded by wires/labels drawn as PDF paths). `doc.extract_image(xref)` only returns the raw raster bytes, ignoring transforms and all vector content. `page.get_pixmap(clip=gap_rect)` renders everything in that region exactly as it appears on the page, including rotation corrections.

### Why skip page 1?
The cover page has instructions numbered 1–5 which would pollute Q1–Q5. The parser waits for a `PART –` section header to confirm real question content has started.

### Why split text blocks?
PyMuPDF sometimes returns a single text block containing multiple question starts (e.g. `" \n15.\nA property..."` immediately following Q14 content). The `split_by_question_numbers()` function splits these using `re.split(r"(?m)(?=^\d{1,2}\.\s)", text)`.

## The script
Located at: `D:\Internship\qpgenerator\parse_qp.py`

To run on a new paper, update `PDF_PATH` and `OUTPUT_DIR` at the top of the script, or copy and adapt it.

## Output format (questions.json)
```json
{
  "1": {
    "number": 1,
    "text": "1.\nThe S I unit of potential difference is\n(A) volt (V)\n...",
    "images": [],
    "has_figure": false,
    "type": "mcq"
  },
  "4": {
    "number": 4,
    "text": "4.\nObserve the below figure...",
    "images": [{"file": "q4_p3_1.png", "width": 420, "height": 180}],
    "has_figure": true,
    "type": "figure_based"
  }
}
```

## Known limitations
- Special characters from unusual PDF fonts may appear as `�` (replacement char) — this is a source PDF issue
- Tables embedded as images are captured as figures but not parsed into structured data
- Handwritten or scanned papers need OCR (pytesseract / Claude vision API) as a post-processing step
