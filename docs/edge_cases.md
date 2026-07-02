# Question Generator — Edge & Corner Cases

**Version**: 1.0  
**Last Updated**: June 2026

---

## 1. Overview

This document catalogs edge and corner cases by component. Each entry describes the scenario, the expected system behaviour, and the implementation note for developers. These cases inform validation logic, prompt design, and error handling — they are not always covered by the happy-path test suite.

---

## 2. PDF Upload & Source Extraction

### EC-SRC-01 — Scanned image PDF (zero extractable text)
**Scenario:** Teacher uploads a PDF that consists entirely of scanned images with no text layer.  
**Expected behaviour:** HTTP 422, message: "Could not extract text from this PDF. Try a text-based PDF." No `QuestionSet` is created.  
**Implementation note:** `pdf-parse` returns an empty or whitespace-only string. Check `text.trim().length === 0` after extraction and throw before creating the document.

---

### EC-SRC-02 — PDF with very little text (< 100 words)
**Scenario:** Teacher uploads a valid, text-based PDF that contains only a paragraph or a title page.  
**Expected behaviour:** Upload succeeds. `QuestionSet` created. Generation is allowed but will likely produce `generationErrors` for most types due to insufficient content.  
**Implementation note:** Do not block upload based on word count — only block on zero text. Let the generation pipeline surface the failure per-type.

---

### EC-SRC-03 — Password-protected PDF
**Scenario:** Teacher uploads a PDF that requires a password to open.  
**Expected behaviour:** HTTP 422 with message "Could not extract text from this PDF." No `QuestionSet` created.  
**Implementation note:** `pdf-parse` throws when it cannot decrypt the file. Catch this and return 422.

---

### EC-SRC-04 — PDF with mostly images and minimal text (e.g. diagrams + captions)
**Scenario:** A science PDF with large diagrams and only caption text.  
**Expected behaviour:** Upload succeeds. `wordCount` reflects only the extracted caption text. Generation proceeds with limited source material — per-type failures expected.  
**Implementation note:** No special handling needed beyond standard extraction.

---

### EC-SRC-05 — Filename with special characters
**Scenario:** Teacher uploads `chapter 5 (final) — v2.pdf`  
**Expected behaviour:** Upload succeeds. `fileName` stored as-is (sanitised for display). Filename does not affect extraction.  
**Implementation note:** Validate filename is printable characters only. Do not use it for anything security-sensitive.

---

### EC-SRC-06 — Duplicate PDF upload for the same content
**Scenario:** Teacher uploads the same PDF twice.  
**Expected behaviour:** Two separate `QuestionSet` drafts are created with different `_id`s. No deduplication.  
**Implementation note:** Source text deduplication is out of scope. Treat each upload as an independent set.

---

## 3. Generation — Count & Type Boundary Cases

### EC-GEN-01 — Count = 0 for a selected type **[CRITICAL]**
**Scenario:** `typeConfig` array contains `{ type: "trueFalse", count: 0 }`.  
**Expected behaviour:** `trueFalse` is silently excluded. Not sent to the generator. Not present as an empty array in the response. Not present in the DB.  
**Implementation note:** Filter out types with `count <= 0` before calling `generateSet()`. This must happen server-side regardless of what the client sends.

---

### EC-GEN-02 — All types have count = 0
**Scenario:** Teacher sends a `typeConfig` where every type has count = 0.  
**Expected behaviour:** HTTP 400 "Select at least one question type with a count greater than 0."  
**Implementation note:** Validate after filtering zero-count types: if the resulting array is empty, reject with 400 before calling the AI.

---

### EC-GEN-03 — Count = 1 (minimum meaningful count)
**Scenario:** Teacher requests exactly 1 question per type across multiple types.  
**Expected behaviour:** Each type generates exactly 1 question. No retries needed unless the AI returns 0.  
**Implementation note:** Trim logic must handle `questions.length > 1` even for small counts.

---

### EC-GEN-04 — Very large count (e.g. count = 100 for a 1000-word PDF)
**Scenario:** Teacher requests 100 questions from a short source PDF.  
**Expected behaviour:** System attempts 3 times. After all retries, records a `GenerationError` with `received: N` (however many were actually generated). Other types unaffected.  
**Implementation note:** The prompt must explicitly state the count. Do not silently cap the count client-side — the failure must be explicit and reported per-type.

---

### EC-GEN-05 — AI returns more questions than requested
**Scenario:** Generator is asked for 5 `trueFalse` questions but the LLM returns 8.  
**Expected behaviour:** Trim to exactly 5. The extra 3 are discarded before storage. `totalGenerated` and `totalMarks` reflect the trimmed count.  
**Implementation note:** After parsing the AI response, apply `questions.slice(0, count)` before schema validation and ID assignment. Recalculate `totalMarks` after trimming.

---

### EC-GEN-06 — AI returns exactly the requested count on first attempt
**Scenario:** Normal happy-path generation.  
**Expected behaviour:** No retry triggered. Questions stored as-is after validation.  
**Implementation note:** Check `received >= requested` immediately after parsing — if true, trim and exit the loop without a retry attempt.

---

### EC-GEN-07 — AI returns 0 questions (empty array)
**Scenario:** LLM returns `[]` (e.g. it could not understand the source or the type).  
**Expected behaviour:** Retry triggered. After 3 attempts all returning 0, `GenerationError` recorded with `received: 0`.  
**Implementation note:** `received === 0` is treated the same as a shortfall — triggers retry logic. The error message should reflect "could not generate any questions."

---

### EC-GEN-08 — AI returns invalid JSON
**Scenario:** LLM response body is malformed (syntax error, truncated, or wrapped in markdown).  
**Expected behaviour:** JSON parse fails. The attempt is counted as failed. Retry triggered.  
**Implementation note:** Wrap `JSON.parse()` in a try/catch. A parse error counts as a failed attempt. Strip markdown code fences before parsing (` ```json ... ``` `).

---

### EC-GEN-09 — AI returns questions with extra fields
**Scenario:** LLM adds a `"difficulty": "hard"` field not in the schema.  
**Expected behaviour:** The question is valid if all required fields are present. Extra fields are stripped during schema validation before storage.  
**Implementation note:** Use Zod's `.strip()` mode (default) so unknown keys are removed rather than causing a validation failure.

---

### EC-GEN-10 — AI returns questions with missing required fields
**Scenario:** LLM omits `explanation` from some questions.  
**Expected behaviour:** Those questions fail schema validation. They are discarded and not counted as generated (counted as shortfall → triggers retry).  
**Implementation note:** Validate each question individually. Count only schema-valid questions as "received." Invalid ones are silently dropped before the count check.

---

### EC-GEN-11 — Groq API timeout during generation
**Scenario:** Groq takes > 30 seconds to respond for a specific type.  
**Expected behaviour:** `withTimeout(30000)` throws. The attempt counts as failed. Retry triggered with backoff.  
**Implementation note:** After 3 timeouts, record `GenerationError` for that type with `error: "Request timed out."` Other parallel types are not affected.

---

### EC-GEN-12 — Groq 429 rate limit during generation
**Scenario:** Groq returns 429 (rate limit exceeded) mid-generation.  
**Expected behaviour:** `withRetry(3)` handles it with exponential backoff. If all 3 attempts are rate-limited, `GenerationError` recorded.  
**Implementation note:** Detect 429 in the retry wrapper. Backoff durations: 1s, 2s, 4s.

---

### EC-GEN-13 — Daily token budget exceeded mid-generation
**Scenario:** Teacher's daily Groq token budget is exhausted partway through a multi-type generation run.  
**Expected behaviour:** Types processed before the budget is hit succeed. The type whose call is blocked returns a `GenerationError` with `error: "Daily token budget exceeded."` HTTP 429 is returned if the budget is hit before any type starts.  
**Implementation note:** Check token budget before each Groq call. Track cumulative usage within the run and abort cleanly if the budget is exceeded.

---

## 4. Generation — Schema-Specific Corner Cases

### EC-GEN-14 — fillInBlanks: blank text in question
**Scenario:** LLM returns a `fillInBlanks` question where `question.text` contains no `_____` placeholder.  
**Expected behaviour:** Question passes schema validation (the schema does not enforce the blank presence). Accepted as-is.  
**Implementation note:** Schema validation only checks field types and presence. Prompt engineering must enforce the blank convention.

---

### EC-GEN-15 — multipleChoice: only one option returned
**Scenario:** LLM returns an MCQ with `options: [{ text: "A" }]`.  
**Expected behaviour:** Question fails schema validation (MCQ should have at least 2 options). Discarded, counted as shortfall.  
**Implementation note:** Add a Zod refinement: `options: z.array(optionSchema).min(2)`.

---

### EC-GEN-16 — multipleChoice: correctAnswer not matching any option text
**Scenario:** LLM returns `correctAnswer: "Option D"` but `options` only contains A, B, C.  
**Expected behaviour:** Question passes schema validation (correctAnswer is a string — format is enforced). Accepted as-is; it is the Teacher's responsibility to review.  
**Implementation note:** Cross-referencing `correctAnswer` against `options` is not enforced by schema validation. Prompt must instruct the model to match.

---

### EC-GEN-17 — multiSelect: correctAnswer is an empty array
**Scenario:** LLM returns `correctAnswer: []` for a `multiSelect` question.  
**Expected behaviour:** Question fails schema validation. Discarded, counted as shortfall.  
**Implementation note:** Add Zod refinement: `correctAnswer: z.array(z.string()).min(1)`.

---

### EC-GEN-18 — matchTheFollowing: leftItems and rightItems have different lengths
**Scenario:** LLM returns 3 left items and 4 right items.  
**Expected behaviour:** Accepted — mismatched lengths are valid in some matching question formats. No schema enforcement of equal length.  
**Implementation note:** Do not add a length equality constraint in the Zod schema.

---

### EC-GEN-19 — sorting: correctAnswer references a category not in categories array
**Scenario:** `correctAnswer: { "Animals": ["Dog"] }` but `categories` array does not contain `"Animals"`.  
**Expected behaviour:** Passes schema validation. Teacher should catch this in review.  
**Implementation note:** Category cross-referencing is not enforced by schema validation.

---

### EC-GEN-20 — trueFalse: correctAnswer is a string "true" instead of boolean
**Scenario:** LLM returns `correctAnswer: "true"` (string) instead of `true` (boolean).  
**Expected behaviour:** Fails schema validation (`correctAnswer` must be boolean). Discarded, counted as shortfall.  
**Implementation note:** Zod enforces `z.boolean()` strictly. No coercion.

---

## 5. ID Assignment

### EC-ID-01 — IDs after partial generation failure
**Scenario:** 3 types requested; 1 fails. 2 types succeed with 10 questions each.  
**Expected behaviour:** 20 questions receive IDs 1–20. The failed type contributes no questions, so no ID gaps appear.  
**Implementation note:** `assignGlobalIds()` only receives the `questionBlocks` from successful types. Failed types are not included.

---

### EC-ID-02 — IDs after regeneration of a middle type
**Scenario:** Set has `fillInBlanks` (IDs 1–10), `multipleChoice` (IDs 11–15), `trueFalse` (IDs 16–20). Teacher regenerates `multipleChoice`.  
**Expected behaviour:** All 20 questions have IDs reassigned from 1–20 after regeneration. The new `multipleChoice` questions receive IDs 11–15 (or whatever the new assignment produces). All IDs remain unique.  
**Implementation note:** `assignGlobalIds()` is called on the full merged set after regeneration replaces the block. IDs are always reassigned from scratch — never preserved from a previous run.

---

### EC-ID-03 — ID assignment with a single type, very large count
**Scenario:** Single `fillInBlanks` block with 50 questions.  
**Expected behaviour:** Questions numbered 1–50 sequentially.  
**Implementation note:** No special handling; `assignGlobalIds()` is a simple incrementing counter.

---

## 6. Export Validation

### EC-EXP-01 — totalMarks mismatch **[CRITICAL]**
**Scenario:** A question's `marks` is edited to 5 in DB but `totalMarks` for the block is still 10 (10 questions × 1 mark).  
**Expected behaviour:** Export blocked. "Invalid question structure detected."  
**Implementation note:** `validateExportSet()` must recompute `sum(q.marks)` for each block and compare to `block.totalMarks`. If they differ, throw.

---

### EC-EXP-02 — Empty export (no generated questions)
**Scenario:** Teacher triggers export on a set that has been configured but not yet generated.  
**Expected behaviour:** HTTP 400 "No generated questions to export."  
**Implementation note:** Check `blocks.length === 0` before running the full validation pass.

---

### EC-EXP-03 — Export with one block in failed state
**Scenario:** Set has `fillInBlanks` (success) and `multipleChoice` (failed). Teacher exports.  
**Expected behaviour:** Export includes only the `fillInBlanks` block. The `multipleChoice` failure is not included. Export succeeds.  
**Implementation note:** Only include blocks with `status: "success"` in the export array.

---

### EC-EXP-04 — All blocks in failed state
**Scenario:** All types failed generation.  
**Expected behaviour:** HTTP 400 "No generated questions to export."  
**Implementation note:** After filtering to `status: "success"` blocks, if none remain, return 400.

---

### EC-EXP-05 — Export after editing produces a schema violation
**Scenario:** Teacher edits a question and accidentally clears `explanation`. Export is triggered.  
**Expected behaviour:** Export blocked. "Invalid question structure detected."  
**Implementation note:** `validateExportSet()` runs on the live data at export time, not at edit time. This catches violations introduced after generation.

---

### EC-EXP-06 — Concurrent export requests
**Scenario:** Teacher double-clicks Export and sends two simultaneous requests.  
**Expected behaviour:** Both requests run independently and both succeed (or both fail). Two `ExportEvent` entries are appended to `exportHistory`. No data corruption.  
**Implementation note:** No locking is required — the export is a read-only operation on the stored questions. Concurrent appends to `exportHistory` are safe in MongoDB.

---

## 7. Role & Access Control

### EC-ROLE-01 — HOD in Department A reads a set from Department B
**Scenario:** HOD from Mathematics POSTs to `/api/sets/:id` where the set belongs to a Science teacher.  
**Expected behaviour:** HTTP 403 "You don't have permission to view this set."  
**Implementation note:** `requireRole('hod')` passes, but the route handler must check `set.department === req.userDepartment` and reject if not.

---

### EC-ROLE-02 — Principal accessing raw question content
**Scenario:** Principal sends GET `/api/sets/:id`.  
**Expected behaviour:** The endpoint either returns 403, or returns the set with `correctAnswer` fields stripped.  
**Implementation note:** Design decision to make explicit: either block Principals from `/api/sets/:id` entirely, or strip sensitive fields. The PRD says Principal "cannot open raw question content" — so the endpoint should return 403 for the Principal role.

---

### EC-ROLE-03 — Teacher submitting a set that is already in `review_pending`
**Scenario:** Teacher submits a set twice.  
**Expected behaviour:** HTTP 400 "Set is already submitted or approved."  
**Implementation note:** Check `set.status === 'draft' || set.status === 'revision_requested'` before allowing submit. All other statuses reject with 400.

---

### EC-ROLE-04 — HOD approving an already-approved set
**Scenario:** HOD clicks Approve on a set that is already in `approved` status.  
**Expected behaviour:** HTTP 400 "Set is not in a reviewable state."  
**Implementation note:** Only allow approve when `set.status === 'review_pending'`.

---

### EC-ROLE-05 — Student accessing assessment before HOD approval
**Scenario:** Student tries to access a set that is in `review_pending` status using the direct set ID.  
**Expected behaviour:** HTTP 403 or 404. The set is not surfaced in the student's assessment list.  
**Implementation note:** `/api/assessments` query filters `{ status: "approved" }`. Direct ID access via `/api/assessments/:id` also checks status before returning.

---

### EC-ROLE-06 — Tampered JWT with forged role
**Scenario:** A user modifies the JWT payload to change `role: "student"` to `role: "teacher"`.  
**Expected behaviour:** JWT signature verification fails. HTTP 401.  
**Implementation note:** `verifyAccessToken()` uses `JWT_ACCESS_SECRET` to verify the signature. A tampered token will not produce a valid signature and is rejected before `req.role` is set.

---

## 8. Session & Auth

### EC-AUTH-01 — Refresh token reuse after rotation
**Scenario:** Client stores the refresh token and tries to reuse the old one after rotation.  
**Expected behaviour:** HTTP 401 "Refresh token invalid or expired." The old token no longer exists in MongoDB.  
**Implementation note:** `findOneAndDelete({ token: oldToken })` atomically consumes the token. A reuse attempt returns null from the query → 401.

---

### EC-AUTH-02 — Two concurrent refresh requests with the same token
**Scenario:** Client sends two simultaneous POST `/api/auth/refresh` calls (e.g. two racing API calls both hit 401 and both try to refresh).  
**Expected behaviour:** One request succeeds and rotates the token. The other receives 401 (the token was already consumed).  
**Implementation note:** `findOneAndDelete` is atomic — only one call can consume the token. The second call gets a null result → 401. The client should implement a refresh lock to prevent this race.

---

### EC-AUTH-03 — Login with email containing leading/trailing spaces
**Scenario:** User submits `" jane@school.edu "` (with spaces).  
**Expected behaviour:** Login succeeds — server trims and lowercases the email before lookup.  
**Implementation note:** Trim and lowercase email in the login handler before querying the DB, mirroring the normalisation applied at registration.

---

### EC-AUTH-04 — Reset password requested twice rapidly
**Scenario:** Teacher clicks "Forgot Password" twice in quick succession.  
**Expected behaviour:** Only the most recent reset link works. The first link is invalidated because the old `PasswordResetToken` was deleted before the new one was created.  
**Implementation note:** `POST /api/auth/forgot-password` deletes any existing tokens for the user before creating a new one.

---

## 9. Data Integrity

### EC-DATA-01 — Generation run creates a GenerationRun even on partial failure
**Scenario:** 3 types requested; 1 fails.  
**Expected behaviour:** A single `GenerationRun` document is created recording all 3 types in `typesRequested`, only the 2 successes in `typesSucceeded`, and the 1 failure in `typesFailed`.  
**Implementation note:** `GenerationRun` is created in a `finally` block (or after the parallel run completes) regardless of whether individual types failed.

---

### EC-DATA-02 — Export history survives question edits
**Scenario:** Teacher exports, then edits a question, then exports again.  
**Expected behaviour:** `exportHistory` contains two entries (one for each export). The first export's record is not modified by the edit.  
**Implementation note:** `exportHistory` is append-only — each export event is pushed, never overwritten.

---

### EC-DATA-03 — Regeneration resets generationErrors for that type only
**Scenario:** `multipleChoice` failed in the initial generation. Teacher regenerates `multipleChoice` successfully.  
**Expected behaviour:** The `GenerationError` entry for `multipleChoice` is removed from `generationErrors`. Other type errors (if any) remain.  
**Implementation note:** On successful regeneration, filter out the error entry for that type: `generationErrors = generationErrors.filter(e => e.type !== regeneratedType)`.

---

### EC-DATA-04 — Set status regresses correctly after revision request
**Scenario:** HOD requests revision. Teacher regenerates the flagged type and resubmits.  
**Expected behaviour:** Set status flows: `revision_requested` → (teacher regenerates) → `review_pending` again. The set re-enters the HOD queue.  
**Implementation note:** `POST /api/sets/:id/submit` must allow submission from `revision_requested` status, not only from `draft`.

---

## 10. Performance & Concurrency

### EC-PERF-01 — Long-running PDF with many types
**Scenario:** Teacher requests all 7 types × 10 questions each from a dense PDF.  
**Expected behaviour:** All 7 types run in parallel. Total wall-clock time should not equal the sum of per-type times. Each type may still hit the 30-second timeout independently.  
**Implementation note:** Use `Promise.allSettled()` to run all types in parallel. Settled results include both fulfilled (success) and rejected (failure) outcomes.

---

### EC-PERF-02 — Two teachers generating from the same set simultaneously
**Scenario:** Teacher double-clicks Generate and sends two simultaneous POST `/api/sets/:id/generate` requests.  
**Expected behaviour:** Both requests process concurrently. The last one to write wins. No data corruption.  
**Implementation note:** This is a known race condition. For the current scope, no locking is applied. The client should disable the Generate button while generation is in progress to prevent double-submits.

---

### EC-PERF-03 — Student with many assigned assessments
**Scenario:** Student is assigned 50 approved assessments.  
**Expected behaviour:** GET `/api/assessments` returns all 50. No pagination applied at this scope.  
**Implementation note:** Current implementation returns all records. Monitor response size if assessment counts grow large.
