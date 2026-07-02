# Question Generator — Test Cases

**Version**: 1.0  
**Last Updated**: June 2026

---

## 1. Overview

Test cases are organised by feature area. Each case has a unique ID, preconditions, steps, and expected result. Cases marked **[CRITICAL]** cover the three core goals of v2.0: count enforcement, export schema validation, and role-based access.

**ID Format:** `TC-<AREA>-<NUMBER>`  
**Areas:** AUTH, ROLE, SRC, GEN, EDIT, REGEN, EXP, HOD, ANA, STU, SEC

---

## 2. Authentication

### TC-AUTH-01 — Successful registration
**Preconditions:** Email not previously registered  
**Steps:**
1. POST `/api/auth/register` with valid name, email, password, role `teacher`, department `Mathematics`

**Expected:**
- HTTP 201
- Response contains `accessToken` and `user.role = "teacher"`
- `refreshToken` httpOnly cookie set with 7-day expiry

---

### TC-AUTH-02 — Duplicate email registration
**Preconditions:** Email already registered  
**Steps:**
1. POST `/api/auth/register` with the same email as an existing account

**Expected:**
- HTTP 409
- `{ "error": "Email already registered" }`
- No new user document created

---

### TC-AUTH-03 — Password too short
**Steps:**
1. POST `/api/auth/register` with `"password": "abc"`

**Expected:**
- HTTP 400
- `{ "error": "Password must be at least 8 characters" }`

---

### TC-AUTH-04 — Invalid role value
**Steps:**
1. POST `/api/auth/register` with `"role": "admin"`

**Expected:**
- HTTP 400
- `{ "error": "Invalid role" }`

---

### TC-AUTH-05 — Successful login
**Preconditions:** User registered  
**Steps:**
1. POST `/api/auth/login` with correct email and password

**Expected:**
- HTTP 200
- Response contains `accessToken` with correct `role` in payload
- `refreshToken` cookie refreshed

---

### TC-AUTH-06 — Wrong password
**Steps:**
1. POST `/api/auth/login` with correct email and wrong password

**Expected:**
- HTTP 401
- `{ "error": "Invalid email or password" }`
- Response does not reveal whether the email exists

---

### TC-AUTH-07 — Token refresh
**Preconditions:** Valid `refreshToken` cookie present  
**Steps:**
1. POST `/api/auth/refresh` with no body

**Expected:**
- HTTP 200
- New `accessToken` returned
- New `refreshToken` cookie set (old one deleted from DB)

---

### TC-AUTH-08 — Token refresh after logout
**Preconditions:** User is logged out  
**Steps:**
1. POST `/api/auth/refresh`

**Expected:**
- HTTP 401
- `{ "error": "Refresh token missing" }`

---

### TC-AUTH-09 — Forgot password — email exists
**Preconditions:** Email registered  
**Steps:**
1. POST `/api/auth/forgot-password` with registered email

**Expected:**
- HTTP 200
- `{ "message": "If that email exists, a reset link has been sent." }`
- Reset email sent to the address
- `PasswordResetToken` document created with 1-hour expiry

---

### TC-AUTH-10 — Forgot password — email does not exist
**Steps:**
1. POST `/api/auth/forgot-password` with unregistered email

**Expected:**
- HTTP 200 (same response — email existence not disclosed)
- No email sent
- No `PasswordResetToken` created

---

### TC-AUTH-11 — Password reset — valid token
**Preconditions:** Valid reset email received  
**Steps:**
1. POST `/api/auth/reset-password` with `token` from email and new `password`

**Expected:**
- HTTP 200
- `{ "message": "Password updated successfully." }`
- User can log in with the new password
- `PasswordResetToken` document deleted

---

### TC-AUTH-12 — Password reset — expired token
**Preconditions:** Reset link older than 1 hour  
**Steps:**
1. POST `/api/auth/reset-password` with the expired token

**Expected:**
- HTTP 400
- `{ "error": "This reset link has expired or is invalid." }`

---

## 3. Role-Based Access Control

### TC-ROLE-01 — Teacher accessing teacher-only endpoint **[CRITICAL]**
**Preconditions:** Logged in as `teacher`  
**Steps:**
1. POST `/api/sets/:id/generate`

**Expected:** HTTP 200 (proceeds to generation logic)

---

### TC-ROLE-02 — HOD attempting to generate **[CRITICAL]**
**Preconditions:** Logged in as `hod`  
**Steps:**
1. POST `/api/sets/:id/generate`

**Expected:**
- HTTP 403
- `{ "error": "You don't have permission to do this." }`

---

### TC-ROLE-03 — Principal attempting to export **[CRITICAL]**
**Preconditions:** Logged in as `principal`  
**Steps:**
1. GET `/api/sets/:id/export`

**Expected:**
- HTTP 403
- No file downloaded

---

### TC-ROLE-04 — Student attempting to export **[CRITICAL]**
**Preconditions:** Logged in as `student`  
**Steps:**
1. GET `/api/sets/:id/export`

**Expected:**
- HTTP 403

---

### TC-ROLE-05 — Student attempting to generate
**Preconditions:** Logged in as `student`  
**Steps:**
1. POST `/api/sets/:id/generate`

**Expected:**
- HTTP 403

---

### TC-ROLE-06 — HOD approving own department's set
**Preconditions:** Logged in as `hod`; set belongs to teacher in same department  
**Steps:**
1. POST `/api/sets/:id/approve`

**Expected:**
- HTTP 200
- Set status updated to `approved`

---

### TC-ROLE-07 — HOD approving another department's set **[CRITICAL]**
**Preconditions:** Logged in as `hod`; set belongs to teacher in a different department  
**Steps:**
1. POST `/api/sets/:id/approve`

**Expected:**
- HTTP 403
- `{ "error": "You can only approve sets from your department." }`

---

### TC-ROLE-08 — Unauthenticated request to protected endpoint
**Steps:**
1. GET `/api/sets` with no `Authorization` header

**Expected:**
- HTTP 401
- `{ "error": "Unauthorized" }`

---

### TC-ROLE-09 — Expired access token
**Preconditions:** Access token expired (> 15 min old)  
**Steps:**
1. GET `/api/sets` with expired token

**Expected:**
- HTTP 401
- Client silently refreshes token and retries
- Original request succeeds with new token

---

## 4. Source PDF Upload

### TC-SRC-01 — Valid PDF upload
**Preconditions:** Logged in as `teacher`  
**Steps:**
1. POST `/api/source/upload` with a valid text-based PDF (< 10 MB)

**Expected:**
- HTTP 201
- Response contains `setId`, `wordCount`, `previewText`
- `QuestionSet` created with status `draft` in DB

---

### TC-SRC-02 — Non-PDF file upload
**Steps:**
1. POST `/api/source/upload` with a `.docx` file

**Expected:**
- HTTP 400
- `{ "error": "Only PDF files are accepted." }`

---

### TC-SRC-03 — PDF exceeds 10 MB
**Steps:**
1. POST `/api/source/upload` with a 15 MB PDF

**Expected:**
- HTTP 400
- `{ "error": "File size exceeds 10 MB limit." }`

---

### TC-SRC-04 — Scanned image PDF (no extractable text)
**Steps:**
1. POST `/api/source/upload` with a scanned PDF

**Expected:**
- HTTP 422
- `{ "error": "Could not extract text from this PDF. Try a text-based PDF." }`
- No `QuestionSet` created

---

### TC-SRC-05 — HOD attempting PDF upload
**Preconditions:** Logged in as `hod`  
**Steps:**
1. POST `/api/source/upload` with a valid PDF

**Expected:**
- HTTP 403

---

## 5. Question Generation

### TC-GEN-01 — Single type, exact count returned **[CRITICAL]**
**Preconditions:** Draft set with source text; logged in as owning `teacher`  
**Steps:**
1. POST `/api/sets/:id/generate` with `typeConfig: [{ type: "fillInBlanks", count: 10, marksPerQuestion: 1 }]`

**Expected:**
- HTTP 200
- `questionBlocks[0].questions.length === 10`
- `generationErrors` is empty
- `totalGenerated === 10`

---

### TC-GEN-02 — Multiple types generated independently **[CRITICAL]**
**Steps:**
1. POST `/api/sets/:id/generate` with:
   ```json
   [
     { "type": "fillInBlanks", "count": 10, "marksPerQuestion": 1 },
     { "type": "multipleChoice", "count": 5, "marksPerQuestion": 2 },
     { "type": "trueFalse", "count": 5, "marksPerQuestion": 1 }
   ]
   ```

**Expected:**
- HTTP 200
- Exactly 3 blocks returned
- `fillInBlanks` block has exactly 10 questions
- `multipleChoice` block has exactly 5 questions
- `trueFalse` block has exactly 5 questions
- `totalGenerated === 20`

---

### TC-GEN-03 — Type with count = 0 excluded **[CRITICAL]**
**Steps:**
1. POST `/api/sets/:id/generate` with `trueFalse` count set to 0, two other types set to > 0

**Expected:**
- HTTP 200
- Response contains no block for `trueFalse`
- `trueFalse` does not appear as an empty array

---

### TC-GEN-04 — IDs are globally unique across types **[CRITICAL]**
**Steps:**
1. Generate `fillInBlanks: 10` and `multipleChoice: 5`
2. Collect all `id` fields from both blocks

**Expected:**
- 15 distinct integer IDs, sequential from 1 to 15
- No duplicate IDs across the two blocks

---

### TC-GEN-05 — explanation present on every question **[CRITICAL]**
**Steps:**
1. Generate any type with count ≥ 1
2. Inspect all returned questions

**Expected:**
- Every question has an `explanation` field
- `explanation` is a non-empty string on every question

---

### TC-GEN-06 — totalMarks calculated correctly
**Steps:**
1. Generate `fillInBlanks: 10` with `marksPerQuestion: 2`

**Expected:**
- `questionBlocks[0].totalMarks === 20`
- Every question has `marks === 2`

---

### TC-GEN-07 — One type fails, others succeed
**Preconditions:** Source PDF has limited content; requesting a very high count for one type  
**Steps:**
1. Generate `fillInBlanks: 5` and `multipleChoice: 50` from a short source

**Expected:**
- HTTP 200
- `fillInBlanks` block succeeds with 5 questions
- `generationErrors` contains an entry for `multipleChoice` with `requested: 50` and the actual `received` count
- `multipleChoice` block not present or marked `status: "failed"`

---

### TC-GEN-08 — No extra fields on questions
**Steps:**
1. Generate `trueFalse: 5`
2. Inspect the returned question objects

**Expected:**
- Each question contains only: `id`, `marks`, `question`, `correctAnswer`, `explanation`
- No unexpected fields present

---

### TC-GEN-09 — Teacher cannot generate for another teacher's set
**Preconditions:** Two teacher accounts; set belongs to Teacher A  
**Steps:**
1. Log in as Teacher B
2. POST `/api/sets/:teacherA_setId/generate`

**Expected:**
- HTTP 403

---

## 6. Question Editing

### TC-EDIT-01 — Edit question text
**Preconditions:** Set with generated questions; logged in as owning `teacher`  
**Steps:**
1. PATCH `/api/sets/:id/questions/:questionId` with updated `question.text`

**Expected:**
- HTTP 200
- Updated question returned
- Other questions in the set unchanged

---

### TC-EDIT-02 — Edit correctAnswer
**Steps:**
1. PATCH `/api/sets/:id/questions/:questionId` with new `correctAnswer`

**Expected:**
- HTTP 200
- `correctAnswer` updated in DB

---

### TC-EDIT-03 — Edit removes explanation (schema violation)
**Steps:**
1. PATCH `/api/sets/:id/questions/:questionId` with `"explanation": ""`

**Expected:**
- HTTP 400
- `{ "error": "Updated question does not match the required schema for type <type>." }`
- Question unchanged in DB

---

### TC-EDIT-04 — HOD cannot edit questions
**Preconditions:** Logged in as `hod`  
**Steps:**
1. PATCH `/api/sets/:id/questions/:questionId`

**Expected:**
- HTTP 403

---

## 7. Regeneration

### TC-REGEN-01 — Regenerate a single type
**Preconditions:** Set with at least two generated types; logged in as owning `teacher`  
**Steps:**
1. POST `/api/sets/:id/regenerate` with `{ "type": "multipleChoice", "count": 5, "marksPerQuestion": 2 }`

**Expected:**
- HTTP 200
- `multipleChoice` block replaced with 5 new questions
- Other question blocks unchanged
- Global IDs reassigned — all IDs still unique

---

### TC-REGEN-02 — IDs unique after regeneration **[CRITICAL]**
**Steps:**
1. Generate `fillInBlanks: 10` and `multipleChoice: 5` (IDs 1–15)
2. Regenerate `multipleChoice: 5`

**Expected:**
- All 15 questions still have unique IDs 1–15
- No collision between `fillInBlanks` IDs and regenerated `multipleChoice` IDs

---

## 8. Export

### TC-EXP-01 — Valid export downloads a file **[CRITICAL]**
**Preconditions:** Set with successfully generated questions; logged in as owning `teacher`  
**Steps:**
1. GET `/api/sets/:id/export`

**Expected:**
- HTTP 200
- `Content-Disposition: attachment; filename="questions_<timestamp>.json"`
- Body is a valid JSON array
- Each block matches the PRD top-level structure: `{ questionType, totalMarks, questions[] }`
- `ExportEvent` appended to `QuestionSet.exportHistory`

---

### TC-EXP-02 — Export validates totalMarks **[CRITICAL]**
**Preconditions:** Manually set `questionBlocks[0].totalMarks` to an incorrect value in DB  
**Steps:**
1. GET `/api/sets/:id/export`

**Expected:**
- HTTP 400
- `{ "error": "Invalid question structure detected." }`
- No file downloaded

---

### TC-EXP-03 — Export blocked when explanation is missing **[CRITICAL]**
**Preconditions:** Manually remove `explanation` from one question in DB  
**Steps:**
1. GET `/api/sets/:id/export`

**Expected:**
- HTTP 400
- `{ "error": "Invalid question structure detected." }`

---

### TC-EXP-04 — Export blocked with duplicate IDs **[CRITICAL]**
**Preconditions:** Manually set two questions to have the same `id` in DB  
**Steps:**
1. GET `/api/sets/:id/export`

**Expected:**
- HTTP 400
- `{ "error": "Invalid question structure detected." }`

---

### TC-EXP-05 — Export only includes generated types
**Preconditions:** Set configured for 3 types but only 2 succeeded  
**Steps:**
1. GET `/api/sets/:id/export`

**Expected:**
- Exported JSON contains exactly 2 blocks
- Failed type is absent from the file entirely

---

### TC-EXP-06 — Export file name format
**Steps:**
1. GET `/api/sets/:id/export`
2. Check `Content-Disposition` header

**Expected:**
- Filename matches `questions_<unix_timestamp>.json`

---

### TC-EXP-07 — Export as HOD **[CRITICAL]**
**Preconditions:** Logged in as `hod`  
**Steps:**
1. GET `/api/sets/:id/export`

**Expected:**
- HTTP 403
- No file downloaded

---

### TC-EXP-08 — Export as student **[CRITICAL]**
**Preconditions:** Logged in as `student`  
**Steps:**
1. GET `/api/sets/:id/export`

**Expected:**
- HTTP 403

---

## 9. HOD Workflow

### TC-HOD-01 — Submit set for review
**Preconditions:** Teacher has generated at least one type; logged in as owning `teacher`  
**Steps:**
1. POST `/api/sets/:id/submit`

**Expected:**
- HTTP 200
- Set `status` → `review_pending`
- `submittedAt` timestamp set
- Set visible in HOD review queue

---

### TC-HOD-02 — HOD approves set
**Preconditions:** Set in `review_pending`; logged in as HOD in same department  
**Steps:**
1. POST `/api/sets/:id/approve`

**Expected:**
- HTTP 200
- Set `status` → `approved`
- `approvedAt` timestamp set
- `hodId` set to HOD's user ID
- Set now accessible to students

---

### TC-HOD-03 — HOD requests regeneration
**Preconditions:** Set in `review_pending`; logged in as HOD in same department  
**Steps:**
1. POST `/api/sets/:id/request-regeneration` with `{ "types": ["multipleChoice"], "note": "Options too similar." }`

**Expected:**
- HTTP 200
- Set `status` → `revision_requested`
- `typesUnderRevision` contains `"multipleChoice"`
- `hodComment` set to the note

---

### TC-HOD-04 — Cannot submit set with no questions
**Preconditions:** Draft set, no generation run yet  
**Steps:**
1. POST `/api/sets/:id/submit`

**Expected:**
- HTTP 400
- `{ "error": "Cannot submit a set with no generated questions." }`

---

## 10. Analytics

### TC-ANA-01 — Principal sees all departments
**Preconditions:** Sets generated across 3 departments; logged in as `principal`  
**Steps:**
1. GET `/api/analytics`

**Expected:**
- HTTP 200
- `byDepartment` array contains entries for all 3 departments
- `summary.totalSetsGenerated` reflects combined total

---

### TC-ANA-02 — HOD sees own department only
**Preconditions:** Logged in as `hod` in `Mathematics` department  
**Steps:**
1. GET `/api/analytics`

**Expected:**
- HTTP 200
- `byDepartment` contains only the `Mathematics` entry
- No data from other departments

---

### TC-ANA-03 — Teacher cannot access analytics
**Preconditions:** Logged in as `teacher`  
**Steps:**
1. GET `/api/analytics`

**Expected:**
- HTTP 403

---

## 11. Student Assessment

### TC-STU-01 — Student sees only approved sets
**Preconditions:** Sets in `draft`, `review_pending`, and `approved` status; logged in as `student`  
**Steps:**
1. GET `/api/assessments`

**Expected:**
- Only the `approved` set appears in the response
- `draft` and `review_pending` sets are absent

---

### TC-STU-02 — Answer keys stripped from assessment **[CRITICAL]**
**Preconditions:** Approved set with `fillInBlanks` and `multipleChoice` questions; logged in as `student`  
**Steps:**
1. GET `/api/assessments/:id`
2. Inspect all returned question objects

**Expected:**
- No `correctAnswer` field on any question
- No `alternatives` field on any question
- `question.text` and `marks` are present

---

### TC-STU-03 — Student cannot access draft set **[CRITICAL]**
**Preconditions:** Set in `draft` status  
**Steps:**
1. GET `/api/assessments/:id` (student using the set ID directly)

**Expected:**
- HTTP 403 or 404

---

### TC-STU-04 — Student cannot submit for review
**Preconditions:** Logged in as `student`  
**Steps:**
1. POST `/api/sets/:id/submit`

**Expected:**
- HTTP 403

---

## 12. Security

### TC-SEC-01 — NoSQL injection in login body
**Steps:**
1. POST `/api/auth/login` with `{ "email": { "$gt": "" }, "password": "anything" }`

**Expected:**
- HTTP 400 or 401
- `express-mongo-sanitize` strips the `$gt` operator
- No unintended authentication

---

### TC-SEC-02 — Auth rate limiting
**Steps:**
1. POST `/api/auth/login` 11 times in under 15 minutes from the same IP

**Expected:**
- First 10 requests: normal responses (200 or 401)
- 11th request: HTTP 429 `{ "error": "Too many attempts, please try again later." }`

---

### TC-SEC-03 — Security headers present
**Steps:**
1. GET `/api/health`
2. Inspect response headers

**Expected:**
- `X-Frame-Options: SAMEORIGIN` present
- `X-Content-Type-Options: nosniff` present
- `Strict-Transport-Security` present (production)

---

### TC-SEC-04 — Role field not modifiable via API
**Preconditions:** Logged in as `teacher`  
**Steps:**
1. PATCH any editable endpoint with `{ "role": "principal" }` in the body

**Expected:**
- `role` field ignored or rejected
- User's role unchanged in DB
