# Question Paper Generator

An AI-powered assessment authoring platform that converts textbook PDFs and exam schemes into fully formatted, editable question papers.

Teachers upload a textbook and a marking scheme — the system auto-detects chapters, infers the exam structure (sections, question types, marks distribution), generates questions using Groq AI, and exports a ready-to-print `.docx` file with an answer key attached.

---

## Features

- **Textbook upload** — auto-splits a PDF into chapters using bookmarks, heading heuristics, or LLM detection
- **Scheme inference** — upload any scheme/past paper (PDF or DOCX); AI extracts board, tone, difficulty, section structure, and marks distribution
- **9 question types** — MCQ, Fill in Blanks, True/False, Assertion-Reason, Multi-Select, Match the Following, Reordering, Sorting, Short Answer, Long Answer
- **Paper mode** — generates a structured exam paper (Section A / Section B) that matches the uploaded scheme exactly
- **Word export** — downloads a `.docx` with the student-facing question paper + teacher marking scheme on a separate page
- **Role-based access** — Teacher (author), HOD (review/approve), Principal (analytics), Student (take approved assessments)
- **Reference bank** — upload past papers to inject style exemplars into generation prompts

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 6, TypeScript, Tailwind CSS |
| Backend | Express 5, TypeScript, Node.js 22 |
| Database | MongoDB Atlas, Mongoose 8 |
| AI | Groq SDK (`llama-4-maverick-17b-128e-instruct`) |
| PDF parsing | pdf-parse, mammoth |
| Word export | docx |
| Auth | JWT + rotating refresh tokens, bcrypt |

---

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB Atlas account
- Groq API key

### Installation

```bash
git clone https://github.com/your-username/qpgenerator.git
cd qpgenerator
npm install
```

### Environment Variables

Create `server/.env`:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/qpgenerator
JWT_ACCESS_SECRET=<random-string-min-32-chars>
JWT_REFRESH_SECRET=<random-string-min-32-chars>
GROQ_API_KEY=<your-groq-api-key>
GROQ_MODEL=llama-4-maverick-17b-128e-instruct
CLIENT_URL=http://localhost:5173
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<your-email>
SMTP_PASS=<your-app-password>
EMAIL_FROM=noreply@qpgenerator.com
```

### Running Locally

```bash
npm run dev
```

- Client: `http://localhost:5173`
- Server: `http://localhost:3001`

---

## How It Works

1. **Upload a textbook PDF** — chapters are detected and saved
2. **Upload a scheme** (marking scheme / past paper / model paper) — AI infers the exam structure
3. **Select chapters + scheme** on the dashboard — click Generate Paper
4. **Review** the generated paper in the browser (slot-by-slot with status)
5. **Download as Word** — `.docx` with question paper + answer key, ready to edit and print

---

## Project Structure

```
qpgenerator/
├── client/          # React frontend
├── server/          # Express backend
│   └── src/
│       ├── ai/      # Generation, chapter detection, Word export
│       ├── models/  # Mongoose models
│       ├── routes/  # API endpoints
│       └── validation/  # Zod schemas per question type
└── docs/            # Architecture, API, schema, phase scope
```

---

## Roles

| Role | Access |
|------|--------|
| Teacher | Generate, edit, export question sets |
| HOD | Review and approve sets from their department |
| Principal | View analytics across all departments |
| Student | Take approved assessments (no answer keys) |
