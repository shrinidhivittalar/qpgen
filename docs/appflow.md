# Question Generator — Application Flow Documentation

**Version**: 1.0  
**Last Updated**: June 2026

---

## 1. Overview

This document describes every user journey, screen-by-screen flow, and system-level transition in the Question Generator platform. The application supports four distinct roles — Teacher, HOD, Principal, and Student — each with a separate set of permitted screens and actions.

---

## 2. High-Level Navigation Map

```
                        ┌────────────────────────┐
                        │      Login Page         │
                        │   /login                │
                        └──────────┬─────────────┘
                                   │ (role determines destination)
              ┌────────────────────┼──────────────────────────┐
              │                    │                          │
    ┌─────────▼────────┐  ┌────────▼────────┐     ┌──────────▼────────────┐
    │  Teacher          │  │  HOD             │     │  Principal / Student  │
    │  /dashboard       │  │  /review         │     │  /analytics           │
    │                   │  │                  │     │  /assessment          │
    │  Upload PDF        │  │  Department queue│     │                       │
    │  Configure types   │  │  Review set      │     │  Read-only views      │
    │  Generate          │  │  Approve / Reject│     │  No authoring         │
    │  Edit questions    │  │                  │     │                       │
    │  Export JSON       │  │                  │     │                       │
    └───────────────────┘  └──────────────────┘     └───────────────────────┘
```

---

## 3. Authentication Flows

### 3.1 Login

```
[Login Page] — /login
    │  Inputs: Email, Password
    │
    ├─ [Client validation fails] ──► Inline field errors
    │
    ├─ [Submit]
    │        │
    │        ├─ [Invalid credentials] ──► Toast: "Invalid email or password."
    │        │
    │        └─ [Success] ──► Access token stored in memory
    │                         Redirect based on role:
    │                           teacher   → /dashboard
    │                           hod       → /review
    │                           principal → /analytics
    │                           student   → /assessment
    │
    └─ [Forgot password?] ──► /forgot-password
```

### 3.2 Registration

```
[Login Page]
    │
    [Create account] link clicked
    │
    ▼
[Register Page] — /register
    │  Inputs: Name, Email, Password (min 8 chars), Role, Department
    │
    ├─ [Client validation fails] ──► Inline field errors shown, cannot submit
    │
    ├─ [Submit]
    │        │
    │        ├─ [Email already registered] ──► Toast: "Email already registered."
    │        │
    │        └─ [Success] ──► Access token stored in memory
    │                         Redirect → role-appropriate landing page
    │
    └─ [Already have an account?] ──► /login
```

### 3.3 Password Reset

```
[Forgot Password Page] — /forgot-password
    │  Input: Email
    │
    ▼
[Submit]
    │
    └─ [Always returns success message]
       "If that email exists, a reset link has been sent."
            │
            ▼
       [User receives email with reset link]
       Link format: /reset-password?token=<rawToken>
       Expires: 1 hour
            │
            ▼
[Reset Password Page] — /reset-password?token=<rawToken>
    │  Inputs: New password, Confirm password (client-side match check)
    │
    ├─ [Token expired or invalid] ──► Error: "This reset link has expired."
    │
    └─ [Success] ──► Toast: "Password updated successfully."
                     Redirect → /login
```

### 3.4 Session Management

```
[Any Authenticated Request]
    │
    ├─ [Access token valid (15 min TTL)] ──► Request proceeds
    │
    └─ [Access token expired]
              │
              ▼
         [Silent token refresh]
         POST /api/auth/refresh
              │
              ├─ [Refresh token valid] ──► New access token issued
              │                            Original request retried
              │
              └─ [Refresh token expired or invalid]
                        │
                        ▼
                   [Logout] ──► Redirect → /login
                   Toast: "Session expired. Please log in again."
```

---

## 4. Teacher Flows

### 4.1 Dashboard Layout

```
[Dashboard] — /dashboard
    │
    ├── [Header]
    │     Logo | [New Question Set] button | User avatar + logout
    │
    ├── [Sidebar — My Sets]
    │     List of previous question sets with status chips:
    │       Draft | Generating | Review Pending | Approved | Archived
    │
    └── [Main Content Area]
          [New Set flow OR existing set detail]
```

### 4.2 Create New Question Set

```
[Dashboard] → [New Question Set]
    │
    ▼
Step 1: Upload Source PDF
    │
    ├── [Drag-and-drop or browse]
    │       ├─ [> 10 MB] ──► Toast: "File too large. Maximum size is 10 MB."
    │       └─ [Accepted] ──► POST /api/source/upload
    │                           Server extracts text via pdf-parse
    │                           Returns: { setId, wordCount, previewText }
    │
    ├── PDF upload success ──► Step 2 unlocked
    │
    ▼
Step 2: Select or Upload Question Paper Scheme
    │
    ├─ [Teacher has saved schemes]
    │       │
    │       Scheme picker shown — no upload prompt:
    │       ┌──────────────────────────────────────────┐
    │       │  ● 10th CBSE Mathematics Final  [Active] │
    │       │  ○ 10th CBSE Science Midterm             │
    │       │  + Upload a different scheme             │
    │       └──────────────────────────────────────────┘
    │       │
    │       [Select scheme] ──► parsedConfig applied instantly
    │                            Step 3 pre-filled, no upload needed
    │
    ├─ [No saved schemes OR "Upload a different scheme" clicked]
    │       │
    │       [Drag-and-drop or browse — PDF or Word (.docx), max 5 MB]
    │       │
    │       POST /api/schemes/upload
    │       LLM parses scheme → extracts section structure + typeConfig
    │       Returns: { schemeId, parsedConfig, previewSections[] }
    │       │
    │       Save prompt shown:
    │       "Save this scheme for future use?"
    │       Name: [10th CBSE Mathematics Final  ]  [Save]  [Skip]
    │       │
    │       ├─ [Save] ──► Scheme stored; pre-fills Step 3
    │       └─ [Skip] ──► Used once only; pre-fills Step 3; not saved
    │
    ▼
Step 3: Review Pre-filled Type Configurator
    │
    ├── Type cards pre-filled from parsedConfig
    │       Each card: [ ] Enable  |  Count: [10]  |  Marks per question: [1]
    │       All values editable before generating
    │
    ├── Running total: "X questions, Y total marks"
    │
    └─ [Generate] clicked ──► Step 4
```

### 4.7 Scheme Management

```
[Dashboard Sidebar] → [My Schemes]
    │
    GET /api/schemes
    │
    Saved schemes listed:
      Name | Subject | Standard | Exam Type | Last Updated
    │
    [Scheme row] → options:
    │
    ├── [Use] ──► Sets scheme as active for new question sets
    │
    ├── [Replace]
    │       │
    │       [Upload new file]
    │       PATCH /api/schemes/:id/replace
    │       Re-parses → overwrites parsedConfig
    │       Toast: "Scheme updated."
    │
    └── [Delete]
              │
              Confirm modal: "Delete this scheme? Sets generated with it are unaffected."
              DELETE /api/schemes/:id
              Toast: "Scheme deleted."
```

### 4.3 Generation Flow

```
[Generate] triggered
    │
    POST /api/sets/:id/generate
    { typeConfig: [{ type, count, marksPerQuestion }] }
    │
    ▼
[Per-type loading states shown simultaneously]
    │
    Each type card shows one of:
      ⟳ Generating...
      ✓ 10 / 10 generated
      ✗ Failed — "Insufficient source content"
    │
    ▼
[Generation complete]
    │
    ├─ [At least one type succeeded]
    │       ├── Questions displayed inline by type (collapsible)
    │       ├── [Export Questions] button appears
    │       └── Failed types shown with error, [Retry] button per type
    │
    └─ [All types failed]
            Toast: "Generation failed. Check source content and try again."
```

### 4.4 Review and Edit Questions

```
[Generated Question Set]
    │
    ├── [Type Block — e.g. Fill in the Blanks]  (collapsible)
    │     Header: "Fill in the Blanks — 10 questions — 10 marks"
    │     │
    │     └── Question cards
    │           [Edit] clicked on a question card
    │                 │
    │                 ▼
    │           [Inline editor opens]
    │               Fields shown match the type schema
    │               All fields editable: question text, answer, alternatives, explanation
    │               [Save] ──► PATCH /api/sets/:id/questions/:questionId
    │               [Cancel] ──► Discard changes
    │
    └── [Regenerate Type] button per block
              │
              ▼
         POST /api/sets/:id/regenerate { type }
         Same per-type loading state as initial generation
         New questions replace old ones for that type
         Existing other types unaffected
```

### 4.5 Export Flow

```
[Export Questions] button visible (at least one type succeeded)
    │
    [Export Questions] clicked
    │
    ▼
[Client-side pre-check: set has questions?]
    │
    POST /api/sets/:id/export
    │
    ├─ [Validation passes]
    │       └─ Server builds JSON array
    │          HTTP response: Content-Disposition: attachment; filename="questions_<timestamp>.json"
    │          Browser downloads file automatically
    │
    └─ [Validation fails]
            Toast: "Invalid question structure detected."
            No file downloaded
```

### 4.6 Submit for HOD Review

```
[Submit for Review] button (visible after generation succeeds)
    │
    POST /api/sets/:id/submit
    │
    ├─ [Success]
    │       Set status → "review_pending"
    │       Toast: "Submitted for HOD review."
    │       Set card in sidebar shows "Review Pending" chip
    │
    └─ [No questions generated]
            Toast: "Generate at least one question type before submitting."
```

---

## 5. HOD Flows

### 5.1 Review Dashboard

```
[Review Dashboard] — /review
    │
    ├── [Header]
    │     Department name | User avatar + logout
    │
    ├── [Filter tabs]
    │     Pending Review | Approved | Rejected
    │
    └── [Set cards — department question sets]
          Card shows: Teacher name | Subject | # types | # questions | Submitted date
          [Open] ──► Set detail
```

### 5.2 Review a Question Set

```
[Set Detail — HOD view] — /review/:setId
    │
    GET /api/sets/:id (HOD role: can view but not edit)
    │
    ├── Set metadata: Teacher name, submitted date, source file name
    │
    ├── Per-type blocks (read-only question display)
    │     Each block shows: type name | count | total marks
    │     Questions expanded inline for review
    │
    ├── [Approve] button
    │       │
    │       POST /api/sets/:id/approve
    │       │
    │       └─ [Success]
    │               Set status → "approved"
    │               Teachers notified (future)
    │               Set published to Students
    │               Toast: "Question set approved."
    │
    └── [Request Regeneration] button
              │
              ▼
         [Regeneration Request Modal]
           Select type(s) to regenerate
           Optional note to Teacher
           [Send Request]
              │
              POST /api/sets/:id/request-regeneration
              { types: string[], note: string }
              │
              Set status → "revision_requested"
              Toast: "Regeneration request sent to Teacher."
```

---

## 6. Principal Flows

### 6.1 Analytics Dashboard

```
[Analytics Dashboard] — /analytics
    │
    GET /api/analytics
    │
    ├── [Institution Overview]
    │     Total sets generated this month
    │     Approval rate (%)
    │     Average questions per set
    │     Total exports
    │
    ├── [Department Breakdown]
    │     Table: Department | Sets Generated | Approval Rate | Exports | Active Teachers
    │     [Drill into department] ──► Department detail view
    │
    └── [Department Detail]
              GET /api/analytics?department=<name>
              Teacher-level breakdown within dept
              Per-type generation success rates
              Cannot open raw question content or export files
```

---

## 7. Student Flows

### 7.1 Assessment List

```
[Assessments] — /assessment
    │
    GET /api/assessments (student sees only approved, published sets)
    │
    └── Assessment cards
          Card shows: Subject | Teacher | # questions | Status: Available / Submitted
          [Start Assessment] ──► Assessment view
```

### 7.2 Take Assessment

```
[Assessment View] — /assessment/:setId
    │
    GET /api/assessments/:id
    Returns: questions WITHOUT correctAnswer fields (sanitised server-side)
    │
    ├── Questions rendered by type in read-only view
    │     No answer key visible
    │     No Export button
    │     No raw JSON accessible
    │
    └── [Submit Assessment] (future — out of current scope)
```

---

## 8. Error and Fallback States

### 8.1 API Error Handling

| HTTP Status | User-Facing Message | Behaviour |
|-------------|---------------------|-----------|
| 400 | Field-specific validation message | Inline error or toast |
| 401 | "Session expired. Please log in." | Silent token refresh attempted; redirect to login if refresh fails |
| 403 | "You don't have permission to do this." | Toast shown, user stays on page |
| 404 | "Not found." | Toast shown |
| 429 | "Too many requests. Please wait a moment." | Toast shown |
| 503 | "AI service busy. Please try again shortly." | Toast with retry suggestion |
| Network error | "You appear to be offline." | Toast shown |

### 8.2 Generation-Specific Errors

| Scenario | Behaviour |
|----------|-----------|
| Type returns too few after 3 retries | Type card shows: "✗ Failed — only N/M questions could be generated." Other types unaffected. |
| All types fail | Toast: "Generation failed. Check source content." No questions saved. |
| Source PDF has no extractable text | Toast: "Could not extract text from this PDF. Try a text-based PDF." Upload blocked. |
| Groq timeout (> 30s) | `withTimeout()` throws. Type card shows: "✗ Timed out. Try reducing the count." |

### 8.3 Export-Specific Errors

| Scenario | Behaviour |
|----------|-----------|
| totalMarks mismatch | Toast: "Invalid question structure detected." Export blocked. |
| Missing explanation on a question | Toast: "Invalid question structure detected." Export blocked. |
| Duplicate IDs detected | Server fixes IDs before export attempt; if fix fails, export blocked. |

### 8.4 Empty States

| Screen | Message | Action |
|--------|---------|--------|
| Dashboard — no sets | "No question sets yet. Create your first one." | [New Question Set] button |
| HOD review — no pending sets | "No sets pending review in your department." | — |
| Student — no assigned assessments | "No assessments have been assigned to you yet." | — |
| Analytics — no data | "No generation activity to display yet." | — |

---

## 9. Screen Inventory

| Screen | Route | Allowed Roles | Auth Required |
|--------|-------|--------------|---------------|
| Login | `/login` | All | No |
| Register | `/register` | All | No |
| Forgot Password | `/forgot-password` | All | No |
| Reset Password | `/reset-password` | All | No |
| Teacher Dashboard | `/dashboard` | teacher | Yes |
| HOD Review Queue | `/review` | hod | Yes |
| HOD Set Detail | `/review/:setId` | hod | Yes |
| Principal Analytics | `/analytics` | principal, hod | Yes |
| Student Assessment List | `/assessment` | student | Yes |
| Student Assessment View | `/assessment/:setId` | student | Yes |
| 404 | `*` | All | No |
