# Session Notes — figureBased Question Type

## What was built this session

### New question type: `figureBased`
A 12th question type where the teacher uploads a diagram/figure image, the LLM analyzes it via vision API, and generates a question (MCQ or short answer) with optional LaTeX math rendering.

---

## Files changed

### Server
| File | What changed |
|------|-------------|
| `server/src/validation/schemas/figureBased.ts` | **NEW** — Zod schema: `questionText`, `subType` (mcq/shortAnswer), `options[]`, `correctAnswer`, `useLatex`, `explanation`. `imageBase64`/`imageMimeType` are optional (injected server-side, not from LLM) |
| `server/src/types/paperStructure.ts` | Added `'figureBased'` to `PAPER_QUESTION_TYPES` |
| `server/src/validation/schemaMap.ts` | Imported and registered `FigureBasedSchema` |
| `server/src/lib/groqLimiter.ts` | `groqAcquire()` now accepts `tokens` param (default `EST_TOKENS`). Vision calls use `groqAcquire(5000)` to reserve 2× tokens |
| `server/src/ai/prompts.ts` | Added `figureBased` entry to `TYPE_SUFFIX` (fallback only — real generation uses vision path) |
| `server/src/ai/paperGenerator.ts` | Added `FigureImage` interface, `generateFigureQuestion()` (sends image to Groq vision API), `pickFigure()` round-robin, `generatePaper()` now accepts `figureImages?: FigureImage[]`. **Dev mock**: when `GROQ_MOCK_FIGURE=true` returns a LaTeX geometry fixture without calling the API |
| `server/src/ai/wordExporter.ts` | Added `ImageRun` import, `stripLatex()` helper, `figureBased` case in both `renderQuestion` (embeds image at 380×260px) and `renderAnswer` |
| `server/src/routes/sets.ts` | `GeneratePaperBodySchema` now accepts `figureImages?: FigureImageSchema[]` and forwards them to `generatePaper` |

### Client
| File | What changed |
|------|-------------|
| `client/src/types/index.ts` | Added `'figureBased'` to `QuestionType`, `QUESTION_TYPE_LABELS`, `ALL_QUESTION_TYPES`, `emptyResults()` |
| `client/src/main.tsx` | Added `import 'katex/dist/katex.min.css'` |
| `client/src/components/LatexText.tsx` | **NEW** — splits text on `$...$` / `$$...$$`, renders math with KaTeX, plain text passes through |
| `client/src/components/PaperView.tsx` | Added `figureBased` to `LABEL_MAP`, new `FigureBasedResult` component (shows image + LaTeX question + MCQ options or model answer), wired into `QuestionRow` |
| `client/src/components/QuestionBlock.tsx` | Added `figureBased` fields to `Question` interface, `isFigureBased` flag, figure-specific state, editor section (image thumbnail read-only + editable question/options/answer with live LaTeX preview), `QuestionCard` thumbnail view |
| `client/src/hooks/useGeneration.ts` | Added `FigureImageEntry` interface, `figureImages` to `GenerationState`, `addFigureImages()` (File → base64), `removeFigureImage()`, `generatePaper()` now sends `figureImages` in request body |
| `client/src/pages/DashboardPage.tsx` | Added figure upload panel (purple card) above Generate Paper button — visible whenever a scheme with a paper structure is loaded. Shows thumbnails with × remove button |

### Packages installed
- `client`: `katex@0.17.0`, `@types/katex`

---

## Dev mock (to avoid burning API credits during testing)

`server/.env` already has:
```
GROQ_MOCK_FIGURE=true
```

When set, `generateFigureQuestion()` skips the Groq vision call and returns a hardcoded LaTeX geometry question (MCQ for ≤2 marks, short answer for ≥3 marks). Remove or set to `false` for production.

---

## The unsolved testing problem

**Root cause:** The figure upload panel now shows whenever you're in paper mode (scheme loaded). But the `paperStructure` produced by the blueprint inferencer never contains `figureBased` slots — it only generates types like MCQ, short answer, etc. that it recognises from the scheme PDF.

**So even though the panel is visible and you can upload images, generation will not pick them up unless there is at least one `figureBased` slot in the paper structure.**

### Two ways to test end-to-end today

**Option A — Postman (no code change needed):**
Call `POST /api/sets/<setId>/generate-paper` directly with a hand-crafted paper structure:

```json
{
  "paperStructure": {
    "title": "Test Paper",
    "totalMarks": 10,
    "generalInstructions": [],
    "sections": [{
      "label": "A",
      "totalMarks": 10,
      "questions": [
        { "number": 1, "type": "figureBased", "marks": 2 }
      ]
    }]
  },
  "chapterIds": ["<your-chapter-id-from-db>"],
  "figureImages": [{
    "base64": "<base64-encoded-png>",
    "mimeType": "image/png"
  }]
}
```

Headers needed: `Authorization: Bearer <teacher-access-token>`, `Content-Type: application/json`

**Option B — Update blueprint inferencer (proper fix for next session):**
Make `blueprintInferencer.ts` / `blueprintInferencer.ts` capable of producing `figureBased` slots when the scheme PDF mentions "diagram based", "figure based", "map based" questions etc.

---

## What to do next session

1. **Fix the blueprint inferencer** so it can output `figureBased` question slots when it detects diagram/figure/map questions in the scheme PDF. This is the real end-to-end fix.

2. **Verify Word export** — `ImageRun` in docx v9 needs real testing. The `transformation: { width: 380, height: 260 }` is a fixed size; a proper implementation should read image dimensions from the buffer (PNG header bytes 16–23 give width/height).

3. **Excerpt selection improvement** (discussed earlier but not implemented) — make the excerpt selection for flat PDF generation multi-signal: chapter weight + question type content needs + difficulty + Bloom's level.

4. **highValueSnippets population** — verify where this gets set during chapter upload. Currently the schema default is `[]` (empty) and pickExcerpt only uses snippets if non-empty.

---

## Branch
All changes are on branch: `imagebasedQ`
