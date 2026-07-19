# Session Notes — Module 1: Question Bank (Upload → Verify → Browse)

## Branch
All work is on branch: `module1`

## What this session built

A complete question bank pipeline from scratch — stripped the old generation codebase and built Module 1 of a Smart Guru-style product.

---

## Architecture

```
Teacher uploads PDF / JPG / PNG
        ↓
Text extracted (pdf-parse / Tesseract OCR)
        ↓
AI parses into individual questions (Groq / llama-4-maverick)
        ↓
Deterministic confidence scoring
        ↓
≥ 0.75 → auto-accepted into bank
< 0.75 → needs_review queue (verify screen)
        ↓
Source file uploaded to Supabase (PDF or image)
PDF with embedded figures → mupdf extracts those pages as PNG → uploaded per question
        ↓
Teacher verifies flagged questions (sees figure images inline)
        ↓
Question Bank (browse, filter, search)
```

---

## Data model — `ReferenceExemplar`

| Field | Type | Notes |
|-------|------|-------|
| `teacherId` | ObjectId | owner |
| `uploadId` | String (nanoid) | groups questions from one upload |
| `questionType` | String | one of 10 types |
| `rawText` | String | full question text |
| `status` | enum | `accepted` / `needs_review` / `rejected` |
| `confidence` | Number | 0–1, computed deterministically |
| `marks` | Number\|null | extracted by LLM from inline cues |
| `subject` | String | required at upload (dropdown) |
| `class` | String | required at upload (dropdown Class 1–12) |
| `chapter` | String\|null | optional |
| `sourceYear` | Number\|null | optional |
| `sourceImageUrl` | String\|null | Supabase URL of the original uploaded file (PDF or image) |
| `questionImageUrl` | String\|null | Supabase URL of the extracted page PNG for image-based questions |

---

## Confidence scoring (deterministic, no LLM)

Base: **0.65**

| Rule | Δ |
|------|---|
| Text < 30 chars (probably a heading) | −0.40 |
| Starts with "OR" (alternative question) | −0.30 |
| Contains `?` or question word (What/Why/How…) | +0.10 |
| Marks not null | +0.10 |
| MCQ with A)/A. pattern | +0.15 |
| Contains figure/diagram/circuit/graph/shown below… | cap at 0.60 (forces verify) |

Threshold: **0.75** → auto-accept, below → needs_review

---

## API routes — `/api/reference-bank`

| Method | Path | What it does |
|--------|------|-------------|
| POST | `/upload` | Upload PDF/JPG/PNG, extract + parse + store questions |
| GET | `/stats` | `{ totalAccepted }` |
| GET | `/questions` | Paginated bank browser (filters: subject, class, chapter, questionType, marksMin, marksMax, search) |
| GET | `/uploads` | List all uploads with counts (aggregate) |
| DELETE | `/uploads/:uploadId` | Delete all questions from an upload |
| GET | `/uploads/:uploadId/review` | Questions needing review for verify screen |
| PATCH | `/questions/:id` | Accept/reject with optional edits (rawText, marks, questionType) |
| POST | `/questions/bulk-accept` | Accept all needs_review for an uploadId |

---

## Pages built

| Page | Route | What it does |
|------|-------|-------------|
| Dashboard | `/dashboard` | Stats card, upload list with delete, quick-upload card |
| Upload | `/upload` | Drag-drop PDF/JPG/PNG, required subject+class dropdowns, 3-step progress |
| Verify | `/verify/:uploadId` | One-by-one + list view, shows question images inline, accept/reject/edit/bulk-accept |
| Bank | `/bank` | Filter sidebar (subject dropdown, class dropdown, chapter, question type, marks range), search, paginated cards with question images |

---

## Image handling

**JPG/PNG uploads (scanned papers):**
- Original file uploaded to Supabase `QPGen-images` bucket
- URL stored as `sourceImageUrl` on all questions in that upload
- Verify screen shows full paper image in left panel

**PDF uploads with embedded images:**
- `mupdf` (WASM, no native deps) renders only pages that have raster images
- Each image page rendered as PNG → uploaded to Supabase as `{uploadId}/page-{n}.png`
- Auto-matched sequentially to IMAGE_REF questions (1st image question → 1st image page)
- `questionImageUrl` stored per question
- Verify screen shows the matched page image above the question text
- Bank shows images inline on question cards

**IMAGE_REF detection regex:**
```
/\b(figure|diagram|circuit|graph|chart|image|picture|illustration|map|shown below|given below|following figure|refer to|the above|adjacent)\b/i
```

---

## Supabase setup

- Bucket: `QPGen-images` (public)
- No SDK used — raw `fetch` to Supabase Storage REST API (avoids WebSocket issues)
- Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- Gracefully skips if not configured (logs warning at startup, non-fatal)

---

## Key fixes made this session

| Bug | Fix |
|-----|-----|
| `GET /uploads` aggregate not matching (string vs ObjectId) | Cast `req.userId` to `new Types.ObjectId(req.userId)` in aggregate `$match` |
| Supabase SDK crashed on Node 20 (WebSocket) | Removed SDK, use raw `fetch` to Storage REST API |
| `supabaseReady: true` but `sourceImageUrl: null` for PDF | PDFs weren't being uploaded — now all file types go to Supabase |
| Image panel not showing in verify | `sourceImageUrl` now passed via navigation state from upload response, not fetched from question array |
| All PDF questions auto-accepted | IMAGE_REF regex caps confidence at 0.60 → forces verify queue |

---

## What hasn't been tested yet

- Full PDF upload → mupdf image extraction → Supabase upload → verify screen showing question images
- Option A fallback (manual image attachment per question) — not built yet, planned for next session

---

## Pending / next session

1. **Test the full image pipeline** — upload SSLC2025 PDF, verify that image-based questions show the correct page image in the verify screen and bank
2. **Option A fallback** — in verify, let teacher manually upload/replace the image on a question if auto-match got it wrong
3. **BankPage filter dropdowns** — committed but need to verify the dropdowns work end to end with real data
4. **Delete individual questions from bank** — discussed, not built yet (soft-delete via reject action)
5. **Commit the image pipeline** — last batch of changes not committed yet

---

## Packages added this session

| Package | Where | Why |
|---------|-------|-----|
| `tesseract.js` | server | OCR for JPG/PNG scanned papers |
| `mupdf` | server | Render PDF pages to PNG for image extraction |

---

## Env vars needed

```env
SUPABASE_URL=https://ntzlvpsowivwkiwawglj.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...
```
