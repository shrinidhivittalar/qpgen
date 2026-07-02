# Question Generator — Data & API Documentation

**Version**: 1.0  
**Base URL**: `https://your-backend.onrender.com`  
**Auth**: `Authorization: Bearer <access_token>`  
**Content-Type**: `application/json`  
**Last Updated**: June 2026

---

## 1. API Conventions

### 1.1 Request Format

```
Authorization: Bearer <access_token>
Content-Type: application/json
X-Request-ID: <uuid>          (set automatically by server for each request)
```

### 1.2 Response Format

All endpoints return JSON directly — no envelope wrapper.

**Success (2xx):**
```json
{ "set": { "_id": "...", "status": "draft" } }
```

**Error (4xx / 5xx):**
```json
{ "error": "Descriptive error message" }
```

### 1.3 Rate Limiting

| Endpoint Group | Limit | Window |
|---------------|-------|--------|
| All `/api/auth/*` routes | 10 requests | 15 minutes |
| `POST /api/sets/:id/generate` | Per-user token budget | Rolling daily |
| All other authenticated routes | 60 requests | 1 minute |

When rate limited: `429 Too Many Requests`
```json
{ "error": "Too many requests, please try again later." }
```

### 1.4 Role Enforcement

Every authenticated endpoint enforces the caller's role server-side. A `403 Forbidden` is returned if the caller's role is not in the allowed set for that endpoint — regardless of what the client UI shows or hides.

---

## 2. Authentication Endpoints

### POST /api/auth/register

Register a new user account.

**Request:**
```json
{
  "name": "Jane Smith",
  "email": "jane@school.edu",
  "password": "mypassword123",
  "role": "teacher",
  "department": "Mathematics"
}
```

**Validation:**
- `email`: must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- `password`: minimum 8 characters
- `role`: one of `"principal"`, `"hod"`, `"teacher"`, `"student"`
- `department`: required for `hod`, `teacher`, `student` roles

**Response 201:**
```json
{
  "user": {
    "id": "6654f1b2e3a1b4c5d6e7f8a9",
    "name": "Jane Smith",
    "email": "jane@school.edu",
    "role": "teacher",
    "department": "Mathematics"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
Sets `refreshToken` httpOnly cookie (7 days).

**Errors:**
| Status | Message |
|--------|---------|
| 400 | "Invalid email format" |
| 400 | "Password must be at least 8 characters" |
| 400 | "Invalid role" |
| 400 | "Department is required for this role" |
| 409 | "Email already registered" |

---

### POST /api/auth/login

Authenticate with email and password.

**Request:**
```json
{
  "email": "jane@school.edu",
  "password": "mypassword123"
}
```

**Response 200:**
```json
{
  "user": {
    "id": "6654f1b2e3a1b4c5d6e7f8a9",
    "name": "Jane Smith",
    "email": "jane@school.edu",
    "role": "teacher",
    "department": "Mathematics"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
Sets `refreshToken` httpOnly cookie (7 days).

**Errors:**
| Status | Message |
|--------|---------|
| 401 | "Invalid email or password" |

---

### POST /api/auth/refresh

Exchange a refresh token cookie for a new access token.

**Request:** No body. Reads `refreshToken` from httpOnly cookie.

**Response 200:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
Sets new `refreshToken` httpOnly cookie.

**Errors:**
| Status | Message |
|--------|---------|
| 401 | "Refresh token missing" |
| 401 | "Refresh token invalid or expired" |

---

### POST /api/auth/logout

Invalidate the current session.

**Request:** No body.

**Response 200:**
```json
{ "success": true }
```
Clears `refreshToken` cookie.

---

### GET /api/auth/me

Get the currently authenticated user.

**Auth:** Required

**Response 200:**
```json
{
  "user": {
    "id": "6654f1b2e3a1b4c5d6e7f8a9",
    "name": "Jane Smith",
    "email": "jane@school.edu",
    "role": "teacher",
    "department": "Mathematics",
    "createdAt": "2026-06-01T10:00:00.000Z"
  }
}
```

---

### POST /api/auth/forgot-password

Request a password reset email. Always returns 200.

**Request:**
```json
{ "email": "jane@school.edu" }
```

**Response 200:**
```json
{ "message": "If that email exists, a reset link has been sent." }
```

---

### POST /api/auth/reset-password

Set a new password using the token from the reset email.

**Request:**
```json
{
  "token": "raw-reset-token-from-email-url",
  "password": "newpassword123"
}
```

**Response 200:**
```json
{ "message": "Password updated successfully." }
```

**Errors:**
| Status | Message |
|--------|---------|
| 400 | "Reset token is required." |
| 400 | "Password must be at least 8 characters." |
| 400 | "This reset link has expired or is invalid." |

---

## 3. Source Upload Endpoint

### POST /api/source/upload

Upload a PDF and extract its text content. Creates a new draft QuestionSet.

**Auth:** Required  
**Allowed roles:** `teacher`  
**Content-Type:** `multipart/form-data`

**Request:** Form data with field `file` (PDF, max 10 MB).

**Response 201:**
```json
{
  "setId": "6654f1b2e3a1b4c5d6e7f8a9",
  "fileName": "chapter_5_photosynthesis.pdf",
  "wordCount": 1840,
  "previewText": "Photosynthesis is the process by which plants..."
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 400 | "Only PDF files are accepted." |
| 400 | "File size exceeds 10 MB limit." |
| 422 | "Could not extract text from this PDF. Try a text-based PDF." |

---

## 4. Scheme Endpoints

### POST /api/schemes/upload

Upload a question paper scheme (PDF or Word doc), parse it via LLM, and save the extracted config.

**Auth:** Required  
**Allowed roles:** `teacher`  
**Content-Type:** `multipart/form-data`

**Request:** Form data with fields:
- `file` — PDF or .docx scheme file (max 5 MB)
- `name` — display name (e.g. "10th CBSE Mathematics Final")
- `subject` — subject name
- `standard` — grade/standard
- `examType` — optional (e.g. "Final Exam")

**Response 201:**
```json
{
  "schemeId": "6654f1b2e3a1b4c5d6e7f8d0",
  "name": "10th CBSE Mathematics Final",
  "subject": "Mathematics",
  "standard": "10th",
  "examType": "Final Exam",
  "parsedConfig": [
    { "type": "fillInBlanks", "count": 10, "marksPerQuestion": 1 },
    { "type": "multipleChoice", "count": 5, "marksPerQuestion": 2 },
    { "type": "trueFalse", "count": 5, "marksPerQuestion": 1 }
  ],
  "previewSections": [
    "Section A: Fill in the Blanks (10 × 1 mark)",
    "Section B: MCQ (5 × 2 marks)",
    "Section C: True/False (5 × 1 mark)"
  ]
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 400 | "Only PDF and Word (.docx) files are accepted." |
| 400 | "File size exceeds 5 MB limit." |
| 422 | "Could not extract text from this file." |
| 422 | "Could not parse a valid question configuration from this scheme." |

---

### GET /api/schemes

List all saved schemes for the authenticated Teacher.

**Auth:** Required  
**Allowed roles:** `teacher`

**Response 200:**
```json
[
  {
    "_id": "6654f1b2e3a1b4c5d6e7f8d0",
    "name": "10th CBSE Mathematics Final",
    "subject": "Mathematics",
    "standard": "10th",
    "examType": "Final Exam",
    "fileType": "pdf",
    "parsedConfig": [
      { "type": "fillInBlanks", "count": 10, "marksPerQuestion": 1 },
      { "type": "multipleChoice", "count": 5, "marksPerQuestion": 2 }
    ],
    "createdAt": "2026-06-15T09:00:00.000Z",
    "updatedAt": "2026-06-15T09:00:00.000Z"
  }
]
```

---

### GET /api/schemes/:id

Get a single saved scheme.

**Auth:** Required  
**Allowed roles:** `teacher` (own schemes only)

**Response 200:** Full scheme object (same shape as list item above, plus `rawText`).

**Errors:**
| Status | Message |
|--------|---------|
| 403 | "You don't have permission to view this scheme." |
| 404 | "Scheme not found." |

---

### PATCH /api/schemes/:id/replace

Replace a saved scheme with a new uploaded file. Re-parses the scheme and overwrites `parsedConfig`. The Teacher is not asked again until they trigger this manually.

**Auth:** Required  
**Allowed roles:** `teacher` (own schemes only)  
**Content-Type:** `multipart/form-data`

**Request:** Form data with `file` (PDF or .docx). Optionally updated `name`, `subject`, `standard`, `examType`.

**Response 200:** Updated scheme object.

**Errors:** Same as POST /api/schemes/upload.

---

### DELETE /api/schemes/:id

Delete a saved scheme.

**Auth:** Required  
**Allowed roles:** `teacher` (own schemes only)

**Response 200:**
```json
{ "success": true }
```

**Note:** Deleting a scheme does not affect `QuestionSet` documents that previously referenced it via `schemeId` — those sets retain their own `typeConfig`.

---

## 5. Question Set Endpoints

### GET /api/sets

List question sets.

**Auth:** Required  
**Behaviour by role:**
- `teacher`: returns own sets only
- `hod`: returns sets from teachers in own department; filterable by status
- `principal`: returns all sets (use `?department=` to filter)

**Query params:**
- `?status=draft|generating|review_pending|approved|revision_requested` — filter by status
- `?department=Mathematics` — filter by department (principal only)

**Response 200:**
```json
[
  {
    "_id": "6654f1b2e3a1b4c5d6e7f8a9",
    "fileName": "chapter_5.pdf",
    "teacherName": "Jane Smith",
    "department": "Mathematics",
    "status": "review_pending",
    "typesSummary": [
      { "type": "fillInBlanks", "count": 10 },
      { "type": "multipleChoice", "count": 5 }
    ],
    "totalQuestions": 15,
    "submittedAt": "2026-06-20T10:00:00.000Z",
    "createdAt": "2026-06-20T09:00:00.000Z"
  }
]
```

---

### GET /api/sets/:id

Load a specific question set with full question content.

**Auth:** Required  
**Behaviour by role:**
- `teacher`: can only access own sets
- `hod`: can access sets from own department
- `principal`: can access all sets (questions stripped of `correctAnswer`)

**Response 200:**
```json
{
  "_id": "6654f1b2e3a1b4c5d6e7f8a9",
  "fileName": "chapter_5.pdf",
  "teacherId": "...",
  "teacherName": "Jane Smith",
  "department": "Mathematics",
  "status": "review_pending",
  "typeConfig": [
    { "type": "fillInBlanks", "count": 10, "marksPerQuestion": 1 },
    { "type": "multipleChoice", "count": 5, "marksPerQuestion": 2 }
  ],
  "questionBlocks": [
    {
      "questionType": "fillInBlanks",
      "totalMarks": 10,
      "status": "success",
      "questions": [ /* fillInBlanks question objects */ ]
    },
    {
      "questionType": "multipleChoice",
      "totalMarks": 10,
      "status": "success",
      "questions": [ /* multipleChoice question objects */ ]
    }
  ],
  "generationErrors": [],
  "exportHistory": [],
  "hodComment": null,
  "createdAt": "2026-06-20T09:00:00.000Z",
  "updatedAt": "2026-06-20T10:00:00.000Z"
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 403 | "You don't have permission to view this set." |
| 404 | "Question set not found." |

---

### POST /api/sets/:id/generate

Trigger question generation for a configured question set.

**Auth:** Required  
**Allowed roles:** `teacher` (own sets only)

**Request:**
```json
{
  "typeConfig": [
    { "type": "fillInBlanks", "count": 10, "marksPerQuestion": 1 },
    { "type": "multipleChoice", "count": 5, "marksPerQuestion": 2 },
    { "type": "trueFalse", "count": 5, "marksPerQuestion": 1 }
  ]
}
```

**Validation:**
- `typeConfig`: must be a non-empty array
- Each `type` must be one of the 7 supported types
- `count` must be a positive integer
- `marksPerQuestion` must be a positive number
- Types with `count: 0` are ignored

**Response 200:**
```json
{
  "questionBlocks": [
    {
      "questionType": "fillInBlanks",
      "totalMarks": 10,
      "status": "success",
      "questions": [ /* 10 fillInBlanks questions */ ]
    },
    {
      "questionType": "multipleChoice",
      "totalMarks": 10,
      "status": "success",
      "questions": [ /* 5 multipleChoice questions */ ]
    },
    {
      "questionType": "trueFalse",
      "totalMarks": 5,
      "status": "success",
      "questions": [ /* 5 trueFalse questions */ ]
    }
  ],
  "generationErrors": [],
  "totalGenerated": 20
}
```

**Partial success (some types failed):**
```json
{
  "questionBlocks": [
    {
      "questionType": "fillInBlanks",
      "totalMarks": 10,
      "status": "success",
      "questions": [ /* 10 questions */ ]
    }
  ],
  "generationErrors": [
    {
      "type": "multipleChoice",
      "requested": 5,
      "received": 2,
      "error": "Insufficient source content to generate 5 multipleChoice questions."
    }
  ],
  "totalGenerated": 10
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 400 | "typeConfig is required and must be a non-empty array." |
| 400 | "Invalid question type: <type>" |
| 403 | "You don't have permission to generate for this set." |
| 429 | "Daily token budget exceeded." |
| 503 | "AI service unavailable. Please try again." |

---

### PATCH /api/sets/:id/questions/:questionId

Edit an individual question within a set.

**Auth:** Required  
**Allowed roles:** `teacher` (own sets only)

**Request:** Partial question object. Only provided fields are updated. Fields must conform to the question type's schema.

```json
{
  "question": { "text": "The process of _____ converts CO₂ and water into glucose.", "hide_text": false, "read_text": false, "image": "" },
  "correctAnswer": "photosynthesis",
  "alternatives": ["carbon fixation"],
  "explanation": "Photosynthesis is the process plants use to convert light energy into chemical energy."
}
```

**Response 200:** Updated question object.

**Errors:**
| Status | Message |
|--------|---------|
| 400 | "Updated question does not match the required schema for type <type>." |
| 403 | "You don't have permission to edit this question." |
| 404 | "Question not found." |

---

### POST /api/sets/:id/regenerate

Regenerate questions for a specific type within an existing set. Replaces only the questions for that type.

**Auth:** Required  
**Allowed roles:** `teacher` (own sets only)

**Request:**
```json
{
  "type": "multipleChoice",
  "count": 5,
  "marksPerQuestion": 2
}
```

**Response 200:**
```json
{
  "questionBlock": {
    "questionType": "multipleChoice",
    "totalMarks": 10,
    "status": "success",
    "questions": [ /* 5 new multipleChoice questions */ ]
  },
  "error": null
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 400 | "Invalid question type." |
| 403 | "You don't have permission to regenerate for this set." |

---

### POST /api/sets/:id/submit

Submit a question set for HOD review.

**Auth:** Required  
**Allowed roles:** `teacher` (own sets only)

**Request:** No body.

**Response 200:**
```json
{
  "_id": "6654f1b2e3a1b4c5d6e7f8a9",
  "status": "review_pending",
  "submittedAt": "2026-06-20T10:00:00.000Z"
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 400 | "Cannot submit a set with no generated questions." |
| 400 | "Set is already submitted or approved." |

---

### GET /api/sets/:id/export

Export a question set as a validated JSON file download.

**Auth:** Required  
**Allowed roles:** `teacher` (own sets only)

**Request:** No body.

**Response 200:**
```
Content-Type: application/json
Content-Disposition: attachment; filename="questions_1718876400000.json"
```
```json
[
  {
    "questionType": "fillInBlanks",
    "totalMarks": 10,
    "questions": [ /* validated fillInBlanks questions */ ]
  },
  {
    "questionType": "multipleChoice",
    "totalMarks": 10,
    "questions": [ /* validated multipleChoice questions */ ]
  }
]
```

**Errors:**
| Status | Message |
|--------|---------|
| 400 | "Invalid question structure detected." |
| 400 | "No generated questions to export." |
| 403 | "Export is only available to the Teacher role." |

---

### POST /api/sets/:id/approve

Approve a question set for publishing to students.

**Auth:** Required  
**Allowed roles:** `hod` (own department only)

**Request:** No body.

**Response 200:**
```json
{
  "_id": "6654f1b2e3a1b4c5d6e7f8a9",
  "status": "approved",
  "approvedAt": "2026-06-20T14:00:00.000Z",
  "approvedBy": "6654f1b2e3a1b4c5d6e7f8b0"
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 400 | "Set is not in a reviewable state." |
| 403 | "You can only approve sets from your department." |

---

### POST /api/sets/:id/request-regeneration

HOD requests that the Teacher regenerate specific question types.

**Auth:** Required  
**Allowed roles:** `hod` (own department only)

**Request:**
```json
{
  "types": ["multipleChoice", "sorting"],
  "note": "The MCQ options are too similar. Please regenerate with more distinct distractors."
}
```

**Response 200:**
```json
{
  "_id": "6654f1b2e3a1b4c5d6e7f8a9",
  "status": "revision_requested",
  "hodComment": "The MCQ options are too similar. Please regenerate with more distinct distractors.",
  "typesRequested": ["multipleChoice", "sorting"]
}
```

---

## 6. Analytics Endpoints

### GET /api/analytics

Get generation and approval metrics.

**Auth:** Required  
**Allowed roles:** `hod` (own department), `principal` (all departments)

**Query params:**
- `?department=Mathematics` — filter by department (principal only; HOD always sees own dept)
- `?from=2026-06-01&to=2026-06-30` — date range filter

**Response 200:**
```json
{
  "summary": {
    "totalSetsGenerated": 42,
    "totalSetsApproved": 38,
    "approvalRate": 90.5,
    "totalExports": 29,
    "totalQuestionsGenerated": 840
  },
  "byDepartment": [
    {
      "department": "Mathematics",
      "setsGenerated": 15,
      "setsApproved": 14,
      "approvalRate": 93.3,
      "activeTeachers": 3
    },
    {
      "department": "Science",
      "setsGenerated": 27,
      "setsApproved": 24,
      "approvalRate": 88.9,
      "activeTeachers": 5
    }
  ],
  "byType": [
    { "type": "fillInBlanks", "generated": 320, "failureRate": 2.1 },
    { "type": "multipleChoice", "generated": 210, "failureRate": 1.4 },
    { "type": "trueFalse", "generated": 180, "failureRate": 0.5 }
  ]
}
```

---

## 7. Assessment Endpoints (Student)

### GET /api/assessments

List approved assessments assigned to the authenticated student.

**Auth:** Required  
**Allowed roles:** `student`

**Response 200:**
```json
[
  {
    "_id": "6654f1b2e3a1b4c5d6e7f8a9",
    "subject": "Chapter 5 — Photosynthesis",
    "teacherName": "Jane Smith",
    "department": "Science",
    "totalQuestions": 20,
    "approvedAt": "2026-06-20T14:00:00.000Z"
  }
]
```

---

### GET /api/assessments/:id

Load a specific approved assessment. Answer keys are stripped server-side.

**Auth:** Required  
**Allowed roles:** `student`

**Response 200:**
```json
{
  "_id": "6654f1b2e3a1b4c5d6e7f8a9",
  "subject": "Chapter 5 — Photosynthesis",
  "questionBlocks": [
    {
      "questionType": "fillInBlanks",
      "totalMarks": 10,
      "questions": [
        {
          "id": 1,
          "marks": 1,
          "question": {
            "hide_text": false,
            "text": "The process of _____ converts CO₂ and water into glucose.",
            "read_text": false,
            "image": ""
          }
          // correctAnswer and alternatives are NOT returned to students
        }
      ]
    }
  ]
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 403 | "This assessment is not available to you." |
| 404 | "Assessment not found." |

---

## 8. Health Endpoint

### GET /api/health

Server health check. No authentication required.

**Response 200:**
```json
{ "status": "ok" }
```
