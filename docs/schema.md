# Question Generator — Database Schema Documentation

**Version**: 1.0  
**Database**: MongoDB 7 (Atlas)  
**ODM**: Mongoose 8  
**Last Updated**: June 2026

---

## 1. Entity Relationship Overview

```
User ─────────────────────────────────────────────────────────────────
  │                                                                   │
  │ (teacher owns)   (teacher saves)   (hod approves)                │
  │                        │                 │                        │
  ▼                        ▼                 ▼                        │
QuestionSet ◄──────── Scheme                                          │
  │  (references      (parsedConfig pre-fills                         │
  │   schemeId)        the type configurator)                         ▼
  │                                                          RefreshToken
  │  (embedded)           (embedded)                         PasswordResetToken
  │                           │
  ├── typeConfig[]         questionBlocks[]
  │   (per-type count       (type + questions)
  │    config)
  │
  └── generationErrors[]
      exportHistory[]


GenerationRun ──────────────────────────────
  (one per POST /api/sets/:id/generate call)
  Stores: userId, setId, typesRequested,
          typesSucceeded, typesFailed,
          tokensUsed, durationMs, timestamp
```

---

## 2. Collection Definitions

### 2.1 `users`

Core identity collection. Every account that can log in is a User.

```typescript
const UserSchema = new Schema({
  name:           { type: String, required: true, trim: true },
  email:          { type: String, required: true, unique: true, lowercase: true, trim: true },
  hashedPassword: { type: String, required: true },
  role:           { type: String, required: true, enum: ['principal', 'hod', 'teacher', 'student'] },
  department:     { type: String, required: false },
}, { timestamps: true })
```

**Fields:**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `_id` | ObjectId | auto | MongoDB document ID |
| `name` | String | required, trimmed | User's display name |
| `email` | String | unique, lowercase, trimmed | Login email |
| `hashedPassword` | String | required | bcrypt hash (12 rounds) |
| `role` | String | enum | One of: `principal`, `hod`, `teacher`, `student` |
| `department` | String | optional | School department (e.g. "Mathematics"). Required for HOD, Teacher, Student roles at registration |
| `createdAt` | Date | auto | Account creation timestamp |
| `updatedAt` | Date | auto | Last update timestamp |

**Indexes:**
```
{ email: 1 }           — unique index
{ role: 1 }            — filter users by role
{ department: 1 }      — filter users by department (HOD/Principal queries)
```

**Note:** The `role` field is embedded in the JWT payload at login. The server reads `req.role` from the verified token — never from the request body.

---

### 2.2 `schemes`

Stores parsed question paper schemes uploaded by Teachers. A scheme is a reusable blueprint — it holds the LLM-extracted `parsedConfig` that pre-fills the type configurator whenever the Teacher creates a new question set. Persists until the Teacher explicitly replaces or deletes it.

```typescript
const SchemeSchema = new Schema({
  teacherId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name:         { type: String, required: true, maxlength: 100 },
  subject:      { type: String, required: true },
  standard:     { type: String, required: true },
  examType:     { type: String, default: '' },
  rawText:      { type: String, required: true },
  parsedConfig: { type: [TypeConfigSchema], required: true },
  fileType:     { type: String, enum: ['pdf', 'docx'], required: true },
}, { timestamps: true })
```

**Fields:**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `_id` | ObjectId | auto | Document ID |
| `teacherId` | ObjectId | ref User, required | Teacher who uploaded and owns this scheme |
| `name` | String | max 100 chars, required | Display name (e.g. "10th CBSE Mathematics Final") |
| `subject` | String | required | Subject this scheme applies to (e.g. "Mathematics") |
| `standard` | String | required | Grade/standard (e.g. "10th", "Class 12") |
| `examType` | String | optional | Exam category (e.g. "Final Exam", "Midterm", "Unit Test") |
| `rawText` | String | required | Full text extracted from the uploaded scheme file |
| `parsedConfig` | TypeConfig[] | required | LLM-extracted array of `{ type, count, marksPerQuestion }` — same shape as `QuestionSet.typeConfig` |
| `fileType` | String | enum `pdf` \| `docx` | Format of the original uploaded file |
| `createdAt` | Date | auto | — |
| `updatedAt` | Date | auto | Updated when Teacher replaces the scheme |

**Indexes:**
```
{ teacherId: 1 }    — list all schemes for a Teacher
```

**Persistence rule:** A scheme document is never automatically deleted or overwritten. It remains until the Teacher calls `DELETE /api/schemes/:id` or uploads a replacement via `PATCH /api/schemes/:id/replace`. The Teacher is not prompted to re-upload unless they initiate it.

---

### 2.3 `questionsets`

Primary content collection. Each document represents one question set authored by a Teacher. It embeds the source configuration, generated question blocks, generation errors, and export history.

```typescript
const QuestionSetSchema = new Schema({
  teacherId:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  department:       { type: String, required: true },
  fileName:         { type: String, required: true },
  sourceText:       { type: String, required: true },
  status:           {
    type: String,
    enum: ['draft', 'generating', 'review_pending', 'revision_requested', 'approved', 'archived'],
    default: 'draft'
  },
  typeConfig:       { type: [TypeConfigSchema], default: [] },
  questionBlocks:   { type: [QuestionBlockSchema], default: [] },
  generationErrors: { type: [GenerationErrorSchema], default: [] },
  exportHistory:    { type: [ExportEventSchema], default: [] },
  schemeId:         { type: Schema.Types.ObjectId, ref: 'Scheme', default: null },
  hodId:            { type: Schema.Types.ObjectId, ref: 'User', default: null },
  hodComment:       { type: String, default: null },
  typesUnderRevision: { type: [String], default: [] },
  approvedAt:       { type: Date, default: null },
  submittedAt:      { type: Date, default: null },
}, { timestamps: true })
```

**Fields:**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `_id` | ObjectId | auto | Document ID |
| `teacherId` | ObjectId | ref User, required | Owning Teacher |
| `department` | String | required | Inherited from Teacher's department at creation |
| `fileName` | String | required | Original uploaded PDF filename |
| `sourceText` | String | required | Full extracted text from the PDF |
| `status` | String | enum | Current workflow state (see Status Lifecycle below) |
| `typeConfig` | TypeConfig[] | embedded | Per-type count and marks configuration supplied by Teacher |
| `questionBlocks` | QuestionBlock[] | embedded | Generated question data organised by type |
| `generationErrors` | GenerationError[] | embedded | Per-type errors from the most recent generation run |
| `exportHistory` | ExportEvent[] | embedded | Log of every export triggered by the Teacher |
| `schemeId` | ObjectId | ref Scheme, nullable | The saved scheme used to pre-fill the type configurator for this set. Null if Teacher configured manually |
| `hodId` | ObjectId | ref User, nullable | HOD who approved or requested revision |
| `hodComment` | String | nullable | Most recent HOD feedback comment |
| `typesUnderRevision` | String[] | — | Types flagged by HOD for regeneration |
| `approvedAt` | Date | nullable | Timestamp when HOD approved |
| `submittedAt` | Date | nullable | Timestamp when Teacher submitted for review |
| `createdAt` | Date | auto | — |
| `updatedAt` | Date | auto | — |

**Status Lifecycle:**
```
draft  ──► generating  ──► draft (after generation complete, pending submit)
                                 │
                                 ▼
                          review_pending  ──► approved
                                 │
                                 └──► revision_requested  ──► review_pending (after regen)
```

**Indexes:**
```
{ teacherId: 1 }                    — Teacher's own sets
{ department: 1, status: 1 }        — HOD department queue
{ status: 1 }                       — Principal/analytics queries
{ createdAt: -1 }                   — Newest first for dashboards
```

---

### 2.4 Embedded Sub-Schemas

#### TypeConfig

Stored in `QuestionSet.typeConfig`. Records the Teacher's selection for each type.

```typescript
const TypeConfigSchema = new Schema({
  type:              { type: String, required: true },
  count:             { type: Number, required: true, min: 1 },
  marksPerQuestion:  { type: Number, required: true, min: 0.5 },
}, { _id: false })
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | String | One of the 7 supported question types |
| `count` | Number | Requested question count for this type |
| `marksPerQuestion` | Number | Marks assigned to each question of this type |

---

#### QuestionBlock

Stored in `QuestionSet.questionBlocks`. One block per generated question type.

```typescript
const QuestionBlockSchema = new Schema({
  questionType: { type: String, required: true },
  totalMarks:   { type: Number, required: true },
  status:       { type: String, enum: ['success', 'failed'], default: 'success' },
  questions:    { type: [Schema.Types.Mixed], default: [] },
}, { _id: false })
```

| Field | Type | Description |
|-------|------|-------------|
| `questionType` | String | One of the 7 supported types |
| `totalMarks` | Number | Sum of `marks` across all questions in this block |
| `status` | String | `"success"` or `"failed"` |
| `questions` | Mixed[] | Array of type-specific question objects (see PRD §6.2) |

The `questions` array is stored as `Mixed` because each type has a different schema. Zod validation is applied in the application layer before storage and before export.

---

#### GenerationError

Stored in `QuestionSet.generationErrors`. Records per-type failures from the most recent generation run.

```typescript
const GenerationErrorSchema = new Schema({
  type:      { type: String, required: true },
  requested: { type: Number, required: true },
  received:  { type: Number, required: true },
  error:     { type: String, required: true },
}, { _id: false })
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | String | The question type that failed |
| `requested` | Number | Count that was requested |
| `received` | Number | Count actually generated after all retries |
| `error` | String | Human-readable failure reason |

---

#### ExportEvent

Stored in `QuestionSet.exportHistory`. Appended on every successful export.

```typescript
const ExportEventSchema = new Schema({
  exportedAt: { type: Date, default: Date.now },
  fileName:   { type: String, required: true },
  typeCount:  { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
}, { _id: false })
```

| Field | Type | Description |
|-------|------|-------------|
| `exportedAt` | Date | Timestamp of the export |
| `fileName` | String | Filename delivered to the Teacher |
| `typeCount` | Number | Number of type blocks in the exported file |
| `totalQuestions` | Number | Total questions across all types |

---

### 2.5 `generationruns`

Audit log collection. One document is created for every call to `POST /api/sets/:id/generate` or `POST /api/sets/:id/regenerate`. Used for analytics and auditability.

```typescript
const GenerationRunSchema = new Schema({
  setId:             { type: Schema.Types.ObjectId, ref: 'QuestionSet', required: true },
  userId:            { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role:              { type: String, required: true },
  typesRequested:    { type: [String], required: true },
  typesSucceeded:    { type: [String], default: [] },
  typesFailed:       { type: [String], default: [] },
  countsRequested:   { type: Schema.Types.Mixed, required: true },
  countsGenerated:   { type: Schema.Types.Mixed, default: {} },
  tokensUsed:        { type: Number, default: 0 },
  durationMs:        { type: Number, default: 0 },
  requestId:         { type: String },
}, { timestamps: true })
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | auto |
| `setId` | ObjectId | The QuestionSet this run belongs to |
| `userId` | ObjectId | The Teacher (or HOD if regeneration requested by HOD) who triggered it |
| `role` | String | Role of the triggering user |
| `typesRequested` | String[] | Types that were sent to the generator |
| `typesSucceeded` | String[] | Types that returned the correct count |
| `typesFailed` | String[] | Types that failed after all retries |
| `countsRequested` | Mixed | `{ fillInBlanks: 10, multipleChoice: 5 }` |
| `countsGenerated` | Mixed | Actual counts returned per type |
| `tokensUsed` | Number | Total Groq tokens consumed in this run |
| `durationMs` | Number | Wall-clock time for the full generation run |
| `requestId` | String | Correlation ID from the HTTP request |
| `createdAt` | Date | auto |

**Indexes:**
```
{ setId: 1 }           — all runs for a question set
{ userId: 1 }          — all runs by a user
{ createdAt: -1 }      — analytics time-range queries
{ typesFailed: 1 }     — identify common failure types
```

---

### 2.6 `refreshtokens`

Persistent session tokens. One document per active session. Deleted on logout or rotation.

```typescript
const RefreshTokenSchema = new Schema({
  token:     { type: String, required: true, unique: true },
  userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true },
})
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | auto |
| `token` | String | nanoid(64) — raw token (delivered via httpOnly cookie only) |
| `userId` | ObjectId | Token owner |
| `expiresAt` | Date | 7 days from creation |

**Indexes:**
```
{ token: 1 }       — unique lookup index
{ expiresAt: 1 }   — TTL index: MongoDB auto-deletes expired documents
```

---

### 2.7 `passwordresettokens`

Short-lived tokens for the forgot-password flow.

```typescript
const PasswordResetTokenSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true },
})
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | auto |
| `tokenHash` | String | SHA-256 hash of the raw token emailed to the user |
| `userId` | ObjectId | Account being reset |
| `expiresAt` | Date | 1 hour from creation |

**Indexes:**
```
{ tokenHash: 1 }   — unique lookup index
{ expiresAt: 1 }   — TTL index: auto-deletes expired tokens
```

---

## 3. Data Retention Policies

| Collection | Retention Rule |
|------------|---------------|
| `questionsets` | Retained indefinitely unless archived by Teacher or institution admin |
| `generationruns` | Retained for 12 months for audit purposes; older records may be pruned |
| `refreshtokens` | TTL index: auto-deleted after 7 days; also deleted on logout and rotation |
| `passwordresettokens` | TTL index: auto-deleted after 1 hour; also deleted on successful reset |
| `users` | Retained indefinitely unless account deletion is implemented |
