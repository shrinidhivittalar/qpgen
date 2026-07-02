# Question Generator — Phase Scope & Roadmap

**Version**: 1.0  
**Last Updated**: June 2026

---

## Overview

The Question Generator platform is planned across **10 phases**, each shipping a cohesive slice of functionality. Phases 1–4 establish the foundation and source handling. Phases 5–8 build out the core generation and review features. Phases 9–10 add oversight views and harden security for production.

```
Phase 1:    Project Foundation & Auth
Phase 2:    Role-Based Access & User Management
Phase 3:    PDF Upload & Source Extraction
Phase 4:    Scheme Upload, Parsing & Persistence
Phase 5:    Per-Type Question Generation (Count Enforcement)
Phase 6:    Question Editing & Regeneration
Phase 7:    JSON Export with Schema Validation
Phase 8:    HOD Review & Approval Workflow
Phase 9:    Principal Analytics & Student Assessment View
Phase 10:   Security Hardening & Audit Logging
```

---

## Phase 1 — Project Foundation & Auth

**Goal**: Monorepo, dev tooling, Express backend, MongoDB connection, and JWT authentication running locally.

### Deliverables

#### Infrastructure & Tooling
- [ ] Monorepo workspace: `client/` (Vite + React) + `server/` (Express + TypeScript)
- [ ] TypeScript configured across client and server
- [ ] Tailwind CSS + shadcn/ui installed and themed
- [ ] ESLint, Prettier configured
- [ ] `npm run dev` starts both client and server concurrently from root

#### Backend
- [ ] Express 5 server with TypeScript
- [ ] MongoDB connection via Mongoose
- [ ] `GET /api/health` endpoint returning `{ status: "ok" }`
- [ ] `User` model: email, hashedPassword, name, role, department, timestamps
- [ ] `POST /api/auth/register` — validation, bcrypt hash (12 rounds), JWT + refresh cookie
- [ ] `POST /api/auth/login` — bcrypt compare, JWT + refresh cookie
- [ ] `POST /api/auth/refresh` — rotate refresh token, issue new access token
- [ ] `POST /api/auth/logout` — delete refresh token, clear cookie
- [ ] `GET /api/auth/me` — return current user
- [ ] `requireAuth` middleware — verify JWT, attach `req.userId` and `req.role`
- [ ] `validateEnv()` — exit on startup if JWT secrets missing
- [ ] `tokens.ts` — signAccessToken (includes role in payload), verifyAccessToken, createRefreshToken, rotateRefreshToken
- [ ] `RefreshToken` model with TTL index

#### Frontend
- [ ] Login page (`/login`)
- [ ] Register page (`/register`) with role selector and department field
- [ ] Token stored in memory (not localStorage)
- [ ] Fetch interceptor: silent token refresh on 401; redirect to login if refresh fails
- [ ] Route guards: unauthenticated users redirected to `/login`

### Success Criteria
- Register with role `teacher` → login → authenticated request succeeds
- Refresh token persists across page reload
- Logout clears cookie and redirects to login
- `GET /api/health` returns 200

---

## Phase 2 — Role-Based Access & User Management

**Goal**: Role enforcement middleware in place. Each role routes to its correct landing page. Forgot-password flow complete.

### Deliverables

#### Backend
- [ ] `requireRole(...roles)` middleware — returns 403 if `req.role` not in allowed set
- [ ] Apply `requireRole` stubs to all planned routes (even if handlers return placeholder responses)
- [ ] `PasswordResetToken` model — stores SHA-256 hash of token with 1-hour TTL
- [ ] `POST /api/auth/forgot-password` — always returns 200; emails reset link if email exists
- [ ] `POST /api/auth/reset-password` — verifies hashed token, updates bcrypt hash, deletes record
- [ ] `email.ts` service — sends reset email via nodemailer (SMTP)
- [ ] `requestId` middleware — attaches UUID to every request for log correlation
- [ ] Structured JSON logger with level, event, requestId, userId, role, durationMs

#### Frontend
- [ ] Role-aware redirect after login: teacher → `/dashboard`, hod → `/review`, principal → `/analytics`, student → `/assessment`
- [ ] Forgot password page (`/forgot-password`)
- [ ] Reset password page (`/reset-password?token=<raw>`)
- [ ] Role-aware route guards: wrong-role users redirected to their correct landing page

### Success Criteria
- Teacher login redirects to `/dashboard`; accessing `/review` redirects back to `/dashboard`
- HOD login redirects to `/review`
- Forgot-password email received with working reset link
- Reset link clicked after 1 hour shows "expired" error

---

## Phase 3 — PDF Upload & Source Extraction

**Goal**: Teachers can upload a PDF. Extracted text is stored as a draft QuestionSet. Teachers can see their set list.

### Deliverables

#### Backend
- [ ] `pdf-parse` installed and integrated
- [ ] `extractor.ts` — `extractText(buffer): string` — throws if no text found
- [ ] `multer` configured for PDF uploads (10 MB limit, PDF MIME type only)
- [ ] `POST /api/source/upload` — multer middleware → extract text → create draft `QuestionSet` → return `setId` + preview
- [ ] `QuestionSet` model: teacherId, department, fileName, sourceText, status, typeConfig, questionBlocks, generationErrors, exportHistory, hodId, hodComment, typesUnderRevision, approvedAt, submittedAt
- [ ] `GET /api/sets` — list sets (teacher: own; hod: dept; principal: all)
- [ ] `GET /api/sets/:id` — full set with questions (teacher: own only)
- [ ] Client-side PDF file size check (< 10 MB) before upload

#### Frontend
- [ ] Teacher dashboard skeleton at `/dashboard`
- [ ] Upload panel: drag-and-drop + browse, shows file name and word count on success
- [ ] My Sets sidebar: list of sets with status chips (Draft | Review Pending | Approved)

### Success Criteria
- Upload a text-based PDF → set created, preview text shown
- Upload a scanned PDF → error "Could not extract text from this PDF."
- Upload a file > 10 MB → client rejects before upload
- Uploaded set appears in My Sets sidebar with "Draft" status

---

## Phase 4 — Scheme Upload, Parsing & Persistence

**Goal**: Teachers can upload a question paper scheme (PDF or Word doc). The system parses it via LLM, extracts the type/count/marks configuration, and saves it. On every subsequent new question set, the saved scheme pre-fills the configurator automatically — no re-upload required unless the Teacher explicitly replaces it.

### Deliverables

#### Backend
- [ ] `mammoth` installed for Word (.docx) text extraction
- [ ] `ai/schemeParser.ts` — `parseScheme(rawText): TypeConfig[]` — calls Groq with a scheme-parsing prompt; returns validated `parsedConfig` array
- [ ] `Scheme` model: teacherId, name, subject, standard, examType, rawText, parsedConfig, fileType, timestamps
- [ ] `multer` configured for scheme uploads (5 MB limit, PDF + .docx MIME types)
- [ ] `POST /api/schemes/upload` — extract text → parse via LLM → validate parsedConfig → save Scheme document → return schemeId + parsedConfig + previewSections
- [ ] `GET /api/schemes` — list all schemes for authenticated Teacher
- [ ] `GET /api/schemes/:id` — get a single scheme (own only)
- [ ] `PATCH /api/schemes/:id/replace` — re-upload file, re-parse, overwrite parsedConfig
- [ ] `DELETE /api/schemes/:id` — delete scheme (does not affect sets that used it)
- [ ] `schemeId` field added to `QuestionSet` model (nullable ObjectId ref Scheme)
- [ ] `POST /api/sets/:id/generate` updated to accept and store `schemeId` alongside `typeConfig`

#### Frontend
- [ ] Scheme picker UI shown in Step 2 of new question set flow (if Teacher has saved schemes)
- [ ] Saved scheme list: Name | Subject | Standard | [Use] [Replace] [Delete]
- [ ] [Use] pre-fills type configurator cards with scheme's parsedConfig; no upload prompt shown
- [ ] [Upload a different scheme] option opens file upload zone (PDF or .docx)
- [ ] After upload: preview panel shows `previewSections[]` parsed from scheme
- [ ] Save prompt: "Save this scheme for future use?" with name input; [Save] and [Skip] options
- [ ] [Replace] on existing scheme: re-upload flow, same as first upload
- [ ] My Schemes section in dashboard sidebar

### Success Criteria
- Upload a CBSE scheme PDF → parsedConfig extracted → type configurator pre-filled correctly
- Create second question set → scheme picker appears; selecting saved scheme pre-fills configurator instantly, no upload
- Replace scheme → new parsedConfig applies to next set; old sets unaffected
- Delete scheme → disappears from picker; existing sets with that schemeId retain their typeConfig
- Upload a .docx scheme → extracts text correctly and parses config

---

## Phase 5 — Per-Type Question Generation (Count Enforcement)

**Goal**: The core generation feature. Teachers configure types and counts; the system generates exactly the right number of questions per type, independently and in parallel.

### Deliverables

#### Backend
- [ ] `prompts.ts` — per-type system prompts instructing the model on schema, count, and format
- [ ] `generator.ts` — `generateSet(sourceText, typeConfig)`: processes all types in parallel
- [ ] `runTypeLoop(sourceText, type, count, marksPerQuestion)` — single-type generation loop:
  - Initial attempt requesting full count
  - Up to 2 retries with shortfall count
  - Returns questions array or `FailedType` error object
- [ ] Zod schemas for all 7 question types in `validation/schemas/`
- [ ] `validateQuestionBlock(block)` — validates questions against type schema; discards invalid
- [ ] `assignGlobalIds(blocks)` — assigns sequential unique IDs across all type blocks
- [ ] `withRetry(3)` + `withTimeout(30000)` wrappers applied to every Groq call
- [ ] `POST /api/sets/:id/generate` — calls `generateSet()`, stores results on QuestionSet, creates `GenerationRun`
- [ ] `GenerationRun` model for audit logging
- [ ] `tokenBudget.ts` — daily per-user Groq token limit

#### Frontend
- [ ] Type configurator: 7 toggle cards, each with count and marks-per-question inputs
- [ ] Running total: "X questions, Y total marks"
- [ ] [Generate] button — disabled until at least one type has count > 0
- [ ] Per-type loading state during generation: "⟳ Generating..."
- [ ] Per-type success state: "✓ 10 / 10 generated"
- [ ] Per-type failure state: "✗ Failed — Insufficient source content"
- [ ] Question display: collapsible blocks per type showing all generated questions

### Success Criteria
- Configure 10 fillInBlanks + 5 multipleChoice → exactly 15 questions returned across 2 blocks
- Type with count = 0 is excluded from output entirely
- If one type fails, others still return successfully
- Generation with count = 20 never silently returns 10 (old bug)

---

## Phase 6 — Question Editing & Regeneration

**Goal**: Teachers can edit individual questions inline and regenerate a specific type without affecting others.

### Deliverables

#### Backend
- [ ] `PATCH /api/sets/:id/questions/:questionId` — update individual question fields; validate against type schema before saving
- [ ] `POST /api/sets/:id/regenerate` — re-run `runTypeLoop()` for a single type; replace that block in the set; reassign global IDs across the full set
- [ ] Ownership check: only the Teacher who owns the set may edit or regenerate

#### Frontend
- [ ] [Edit] button on each question card
- [ ] Inline editor: fields shown match the question type's schema
- [ ] [Save] triggers PATCH; [Cancel] discards changes
- [ ] [Regenerate Type] button per question block
- [ ] Per-type loading state during regeneration (same as generation)
- [ ] Toast: "Type regenerated — X questions replaced."

### Success Criteria
- Edit a question's text → saved and reflected immediately
- Edit breaks schema (missing explanation) → error returned, question not saved
- Regenerate multipleChoice → only MCQ block replaced; fillInBlanks unchanged
- IDs remain globally unique after regeneration

---

## Phase 7 — JSON Export with Schema Validation

**Goal**: Teachers can download a fully schema-validated JSON file. Export is blocked if any validation rule fails.

### Deliverables

#### Backend
- [ ] `validateExportSet(blocks)` — full validation pass: schema, totalMarks check, ID uniqueness, explanation presence
- [ ] `GET /api/sets/:id/export` — runs validation, builds JSON array, returns as file attachment
- [ ] File name format: `questions_<timestamp>.json`
- [ ] `Content-Disposition: attachment` header set correctly
- [ ] Append `ExportEvent` to `QuestionSet.exportHistory` on every successful export
- [ ] `requireRole('teacher')` enforced — HOD/Principal/Student requests → 403

#### Frontend
- [ ] [Export Questions] button visible only after at least one type has succeeded
- [ ] Button click → GET /api/sets/:id/export → browser auto-downloads file
- [ ] If validation fails → toast: "Invalid question structure detected."
- [ ] Export disabled while generation is in progress

### Success Criteria
- Export a valid set → `.json` file downloaded; opens without errors
- Manually corrupt `totalMarks` in DB → export blocked, error shown
- Export as HOD → 403 returned, button not visible in UI
- File name follows `questions_<timestamp>.json` format exactly

---

## Phase 8 — HOD Review & Approval Workflow

**Goal**: HODs can view pending question sets from their department, approve them for publishing, or request regeneration of specific types.

### Deliverables

#### Backend
- [ ] `GET /api/sets` scoped correctly for HOD role: returns only own-department sets
- [ ] `GET /api/sets/:id` accessible to HOD for review (full question content including answers)
- [ ] `POST /api/sets/:id/submit` — Teacher submits set; status → `review_pending`, submittedAt set
- [ ] `POST /api/sets/:id/approve` — HOD approves; status → `approved`, approvedAt set, hodId set
- [ ] `POST /api/sets/:id/request-regeneration` — HOD sends revision request; status → `revision_requested`, typesUnderRevision set, hodComment set
- [ ] HOD cannot approve sets from other departments → 403

#### Frontend
- [ ] HOD review queue at `/review`: tabs for Pending | Approved | Revision Requested
- [ ] Set cards: Teacher name, subject, question count, submission date
- [ ] Set detail at `/review/:setId`: read-only question display, full answers visible to HOD
- [ ] [Approve] button → confirmation → POST approve → toast: "Set approved and published."
- [ ] [Request Regeneration] button → modal to select types and add note → POST request-regeneration → toast: "Revision request sent."
- [ ] Teacher dashboard shows updated status chips after HOD action

### Success Criteria
- Teacher submits set → appears in HOD queue under "Pending"
- HOD approves → status updates to "Approved"; disappears from pending tab
- HOD requests regeneration → Teacher sees "Revision Requested" chip with HOD comment
- HOD cannot access sets from another department

---

## Phase 9 — Principal Analytics & Student Assessment View

**Goal**: Principals see institution-wide generation metrics. Students see approved assessments without answer keys.

### Deliverables

#### Backend
- [ ] `GET /api/analytics` — aggregated metrics from `GenerationRun` and `QuestionSet` collections
  - Summary: totalSetsGenerated, approvalRate, totalExports, totalQuestionsGenerated
  - Breakdown by department and by question type
  - Filterable by `?department=` and `?from=&to=` date range
- [ ] `GET /api/analytics` scoped by role: HOD sees own dept only; Principal sees all
- [ ] `GET /api/assessments` — list approved sets for the authenticated student
- [ ] `GET /api/assessments/:id` — full question content with `correctAnswer` and `alternatives` fields stripped server-side

#### Frontend
- [ ] Principal/HOD analytics page at `/analytics`
  - Institution overview cards: total sets, approval rate, total exports
  - Department breakdown table with drill-down
  - Per-type generation stats
- [ ] Student assessment list at `/assessment`
- [ ] Student assessment view at `/assessment/:setId`
  - Questions rendered by type, read-only
  - No answer key, no export button, no raw JSON

### Success Criteria
- Principal sees metrics across all departments
- HOD sees `/analytics` scoped to own department only
- Student can view approved assessment questions; `correctAnswer` is absent from response
- Student cannot access a set in `draft` or `review_pending` status

---

## Phase 10 — Security Hardening & Audit Logging

**Goal**: Production-grade security controls and complete audit trail across the full stack.

### Deliverables

#### New Controls
- [ ] `helmet()` added as first middleware — sets HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- [ ] `express-mongo-sanitize` — strips `$` and `.` from all request bodies; prevents NoSQL injection
- [ ] `authLimiter` — 10 requests per 15 minutes on all `/api/auth/*` routes
- [ ] Validate all environment variables at startup via `validateEnv()` — exit if any required var is missing
- [ ] Input validation via Zod on every route confirmed; routes without schemas flagged and fixed
- [ ] Confirm no PII (emails, passwords, tokens) written to structured logs

#### Audit Completeness
- [ ] Confirm every generation run creates a `GenerationRun` document
- [ ] Confirm every export appends to `QuestionSet.exportHistory`
- [ ] Confirm every HOD approval and regeneration request is recorded on the set
- [ ] Verify `GenerationRun` records are queryable for the analytics endpoint

#### Security Checklist (Final State)

| Control | Status |
|---------|--------|
| HTTP security headers (helmet) | PRESENT |
| CORS whitelist | PRESENT |
| Auth endpoint rate limiting | PRESENT |
| General API rate limiting | PRESENT |
| NoSQL injection prevention | PRESENT |
| JWT secrets validated at startup | PRESENT |
| No modifiable role field via API | PRESENT |
| bcrypt 12 rounds | PRESENT |
| httpOnly refresh cookies | PRESENT |
| Refresh token rotation | PRESENT |
| Input validation (Zod) on all routes | PRESENT |
| Server-side role enforcement on all sensitive endpoints | PRESENT |
| Student answer key stripping | PRESENT |
| Token budget enforcement | PRESENT |
| Per-type generation audit log | PRESENT |
| Export event log | PRESENT |

### Success Criteria
- `curl -I <backend>/api/health` shows `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security` headers
- Login attempt with 11+ requests in 15 minutes → 429 response
- HOD attempting to access another department's set → 403
- Student fetching an assessment → `correctAnswer` absent from every question in the response
- Export as non-teacher role → 403
