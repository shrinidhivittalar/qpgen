# Question Generator — Architecture Decision Records

**Version**: 1.0  
**Last Updated**: June 2026

---

## Index

| ID | Title | Status |
|----|-------|--------|
| [ADR-001](#adr-001) | Per-type independent generation pipeline | Accepted |
| [ADR-002](#adr-002) | Server enforces question count via trim and retry | Accepted |
| [ADR-003](#adr-003) | Parallel generation across types using Promise.allSettled() | Accepted |
| [ADR-004](#adr-004) | Server-side global ID assignment after all types complete | Accepted |
| [ADR-005](#adr-005) | Questions embedded in QuestionSet rather than a separate collection | Accepted |
| [ADR-006](#adr-006) | MongoDB over a relational database | Accepted |
| [ADR-007](#adr-007) | Role embedded in JWT payload | Accepted |
| [ADR-008](#adr-008) | Export JSON built at download time from live data | Accepted |
| [ADR-009](#adr-009) | PDF text extracted and discarded — binary not stored | Accepted |
| [ADR-010](#adr-010) | Groq over other LLM providers | Accepted |
| [ADR-011](#adr-011) | Zod for both API validation and question schema validation | Accepted |
| [ADR-012](#adr-012) | GenerationRun as a separate audit collection | Accepted |

---

<a name="adr-001"></a>
## ADR-001 — Per-Type Independent Generation Pipeline

**Status**: Accepted  
**Date**: June 2026

### Context

The platform supports seven question types, each with a distinct JSON schema, distinct prompt requirements, and distinct failure modes. The original system used a single generation call that returned all question types together, which is what caused the count enforcement bug — the AI was free to distribute the output across types however it liked, ignoring per-type targets.

The question was whether to fix the single-call approach (add stronger count instructions and parse the combined output) or restructure generation so each type is its own independent call.

### Decision

Each question type is processed as an entirely independent AI call with its own dedicated system prompt, its own count target, and its own validation pass. There is no combined call.

### Rationale

- A single combined call asks the AI to simultaneously understand seven different schemas and honour seven separate count targets in one response. This is a reliability anti-pattern — the more constraints packed into one prompt, the more likely the AI drifts or ignores some of them.
- Independent calls mean each prompt is focused: one schema, one count, one validation result. The AI has less context to misinterpret.
- Per-type independence is a requirement stated in the PRD: "each question type is processed independently of every other type." Structuring the code this way makes the implementation directly mirror the requirement.
- Per-type failures are cleanly isolated. If `sorting` fails, the `fillInBlanks` result is unaffected. A combined call cannot offer this — a failure in one type contaminates the whole response.

### Consequences

**Positive:**
- Count enforcement becomes straightforward: validate one type at a time against one count target.
- Failures are scoped to the type that failed; the Teacher sees exactly which type failed and why.
- Prompts are shorter, more focused, and easier to iterate on per-type.
- Adding or modifying a question type only requires changing one prompt file and one Zod schema.

**Negative / Trade-offs:**
- N types = N AI calls per generation run. This increases token usage and latency compared to a single combined call.
- Parallel execution (ADR-003) mitigates the latency cost but not the token cost.
- Prompt maintenance across 7 files requires discipline to keep conventions consistent (e.g. explanation requirements, marks format).

---

<a name="adr-002"></a>
## ADR-002 — Server Enforces Question Count via Trim and Retry

**Status**: Accepted  
**Date**: June 2026

### Context

The root cause of the v2.0 production bug was that the system trusted the AI to return the correct number of questions. When the AI returned more or fewer than requested, the system accepted the output as-is. The PRD requires 100% count accuracy with zero silent default substitution.

Two options were considered:
1. Stronger prompt engineering — instruct the AI more forcefully to return exactly N questions, and accept whatever comes back.
2. Server-side enforcement — the server validates the count after every AI call and takes corrective action (trim excess, retry shortfall).

### Decision

The server enforces count independently of what the AI returns:
- If the AI returns more than requested: trim to exactly the requested count before storage.
- If the AI returns fewer than requested: retry with the shortfall count, up to 2 additional attempts.
- If after all retries the count is still short: record an explicit `GenerationError` for that type.

Prompt engineering is still used (the prompt states the count clearly) but is not the enforcement mechanism — the server is.

### Rationale

- LLMs are non-deterministic. No prompt instruction can guarantee an exact output count 100% of the time across all inputs, all models, and all source texts. Relying solely on the prompt repeats the same class of bug that caused the original defect.
- Server-side enforcement is deterministic and testable. The trim and retry logic is plain TypeScript that can be unit tested with mocked AI responses.
- The retry-with-shortfall approach minimises token waste: instead of re-generating all N questions from scratch, only the missing ones are requested in subsequent attempts.
- This approach makes failures explicit: if the AI genuinely cannot produce enough questions from the source content, the system surfaces that as a per-type error rather than silently delivering a smaller set.

### Consequences

**Positive:**
- The PRD's core count enforcement requirement is met deterministically, independent of AI behaviour.
- Excess trimming is invisible to the Teacher (they receive exactly what they asked for).
- Retry-with-shortfall reduces token waste compared to full retries.
- Explicit `GenerationError` gives the Teacher actionable feedback: "only N/M questions could be generated."

**Negative / Trade-offs:**
- Trimming discards questions the AI generated. If the AI always returns N+3, those 3 are wasted on every call.
- Retry adds latency for types where the AI consistently undershoots. A type that needs 2 retries takes roughly 3× the time of a type that succeeds on the first attempt.
- The retry logic adds code complexity. The loop and shortfall tracking must be carefully tested (see edge cases EC-GEN-05 through EC-GEN-13).

---

<a name="adr-003"></a>
## ADR-003 — Parallel Generation Across Types Using Promise.allSettled()

**Status**: Accepted  
**Date**: June 2026

### Context

With per-type independent generation (ADR-001), a Teacher requesting 5 types would trigger 5 separate AI calls. If run sequentially, the total latency would be the sum of each type's generation time — potentially 2–3 minutes for a full set.

Two options were considered:
1. Sequential processing — simpler code, predictable resource usage, easier to debug.
2. Parallel processing — all types run simultaneously; total time is bounded by the slowest type.

### Decision

All selected types are processed in parallel using `Promise.allSettled()`. Each type's `runTypeLoop()` call is a separate promise. The server waits for all promises to settle before returning the combined result.

`Promise.allSettled()` is used over `Promise.all()` specifically because it collects both successes and failures. A rejection from one type does not cancel the others.

### Rationale

- `Promise.all()` would cancel remaining types if any single type threw. This violates the PRD requirement that "per-type generation failures must not block or delay the return of types that succeeded."
- `Promise.allSettled()` is the correct primitive for this use case: fire all, wait for all, collect results, separate successes from failures.
- Parallel execution reduces total generation time from O(N × per-type-time) to O(max per-type-time). For 5 types averaging 10 seconds each, sequential = ~50 seconds; parallel = ~10–15 seconds.
- Node.js handles I/O-bound parallelism well via its event loop. Five concurrent Groq API calls are network I/O and do not block the CPU or require worker threads.

### Consequences

**Positive:**
- Total generation time is bounded by the slowest type, not the sum of all types.
- One type timing out or failing does not delay results from types that succeeded.
- The Teacher sees per-type loading states simultaneously, which is a better UX than sequential one-at-a-time feedback.

**Negative / Trade-offs:**
- All N types make their Groq API calls at the same time. This increases peak token throughput and is more likely to trigger rate limiting than sequential calls.
- Debugging parallel failures is harder than sequential failures — logs from different types interleave. The `requestId` correlation and per-type logging (see architecture.md §9) mitigate this.
- If the user's daily token budget is nearly exhausted, parallel calls may collectively exceed the budget in a burst rather than gracefully stopping mid-way through sequential calls.

---

<a name="adr-004"></a>
## ADR-004 — Server-Side Global ID Assignment After All Types Complete

**Status**: Accepted  
**Date**: June 2026

### Context

The PRD requires that every question ID be globally unique across all types in a combined set — not just unique within its own type. The question was when and where to assign IDs.

Three options were considered:
1. Let the AI assign IDs — include ID assignment in the prompt.
2. Assign IDs per-type immediately after each type's generation completes — using a counter or UUID.
3. Assign IDs centrally, after all types have completed, in a single pass over all questions.

### Decision

IDs are assigned server-side in a single pass after all types have completed generation. The assignment is a sequential integer counter starting at 1, applied in the order types appear in the Teacher's `typeConfig`. The AI is never asked to assign IDs.

### Rationale

- Asking the AI to assign unique IDs across types is unreliable: parallel type calls do not share state, so each AI call would generate IDs independently and collisions would be common.
- Assigning IDs per-type immediately after each call (option 2) risks collision if two types happen to generate the same IDs before the central merge step. This would require a deduplication pass anyway.
- Centralised post-generation assignment is the only approach that guarantees uniqueness without collision risk: it runs after all types are collected, iterates once across the merged list, and assigns IDs in a single sweep.
- Sequential integers are predictable and human-readable — important for a Teacher reviewing or exporting the set.
- After regeneration (ADR-001), the same `assignGlobalIds()` function is called on the full merged set. This ensures IDs are always reassigned from scratch and never carry over stale values.

### Consequences

**Positive:**
- Global uniqueness is guaranteed by construction, not by convention or prompt instruction.
- The function is a pure, side-effect-free utility that is trivially unit-testable.
- Consistent ID ordering (following `typeConfig` order) makes the export file predictable.

**Negative / Trade-offs:**
- IDs are reassigned after every regeneration, so IDs a Teacher may have noted externally will change if any type is regenerated. This is acceptable at the current scope; Teachers review questions inline, not by ID.
- Sequential integers expose the total question count indirectly, but this is not a security concern for this platform.

---

<a name="adr-005"></a>
## ADR-005 — Questions Embedded in QuestionSet Rather Than a Separate Collection

**Status**: Accepted  
**Date**: June 2026

### Context

Generated questions could be stored in two ways:
1. As a separate `questions` collection with each question as its own document and a `setId` foreign key.
2. Embedded as arrays within the `QuestionSet` document itself.

### Decision

Questions are stored as embedded arrays inside `QuestionSet.questionBlocks`. Each block is an object containing `questionType`, `totalMarks`, `status`, and a `questions` array of Mixed-type documents.

### Rationale

- The access pattern is always set-centric: the platform loads, edits, and exports questions by set. Questions are never queried in isolation (e.g. "give me all `trueFalse` questions across all teachers"). Embedding aligns with this pattern.
- A separate collection would require a join on every read (or `populate()` in Mongoose), adding latency and query complexity for no benefit given the access patterns.
- Question sets are bounded in size: the PRD supports a maximum practical range of a few hundred questions per set. MongoDB documents can hold up to 16 MB; even a large question set with 200 questions across all 7 types is well within this limit.
- Embedded documents make atomic updates natural: updating a single question's `explanation` field is a targeted `$set` on the parent document, with no risk of cross-document inconsistency.
- The seven question types have different schemas. A separate collection would either need a polymorphic design (one collection, different shapes) or seven separate collections — both harder to maintain than embedding `Mixed` arrays with application-layer schema validation via Zod.

### Consequences

**Positive:**
- Every set read returns the complete question data in a single query — no joins, no population.
- Atomic updates within a set are straightforward.
- No orphaned question documents if a set is deleted.

**Negative / Trade-offs:**
- A document with many questions and long source text may approach MongoDB's 16 MB limit for very large sets. Not a concern at current scale but worth monitoring.
- Searching for a specific question by content across sets is not efficient. This use case is out of scope but would require a separate collection if added in future.
- `Mixed` type in Mongoose bypasses ODM-level schema enforcement — Zod validation in the application layer is the only guard. Discipline is required to always call `validateQuestionBlock()` before saving.

---

<a name="adr-006"></a>
## ADR-006 — MongoDB Over a Relational Database

**Status**: Accepted  
**Date**: June 2026

### Context

The platform needs to persist users, question sets, questions, generation audit records, and session tokens. The choice was between MongoDB (document store) and a relational database such as PostgreSQL.

### Decision

MongoDB with Mongoose is used as the primary data store.

### Rationale

- The seven question types have structurally different schemas. In a relational model, this would require either a wide polymorphic table (many nullable columns), a separate table per type (seven tables, complex joins), or a JSONB column (which negates the relational benefit). MongoDB's document model stores each type as its natural shape with no schema gymnastics.
- The `semanticState`, `typeConfig`, `generationErrors`, and `exportHistory` fields are naturally document-shaped objects and arrays. Normalising these into relational tables would add significant schema overhead with no query benefit.
- MongoDB Atlas free tier is available for internship-scale deployment, matching the Render-hosted Express backend in the same deployment tier.
- The team already has MongoDB experience from the Excaliber project, reducing ramp-up time.
- Flexible schema (Mixed type) allows question blocks to evolve per type without a migration for every change.

### Consequences

**Positive:**
- Question data stored in its natural shape — no ORM mapping between the API's JSON response and the DB schema.
- Schema changes to question types require only a Zod schema update; no DB migrations.
- Embedding questions in QuestionSet (ADR-005) is idiomatic and efficient in MongoDB.

**Negative / Trade-offs:**
- No native foreign key constraints or join operations — referential integrity (e.g. ensuring `teacherId` exists in `users`) is enforced at the application layer only.
- Complex analytics queries (e.g. approval rates over time by department) require MongoDB aggregation pipelines, which are more verbose than SQL GROUP BY queries.
- `Mixed` type fields bypass Mongoose schema validation — application-layer Zod validation is the sole enforcement mechanism for question data.

---

<a name="adr-007"></a>
## ADR-007 — Role Embedded in JWT Payload

**Status**: Accepted  
**Date**: June 2026

### Context

The platform has four roles and enforces role-based access on every sensitive endpoint. The server needs to know the caller's role on every request. Two approaches were considered:

1. Embed the role in the JWT payload at login — `requireAuth` reads the role from the token.
2. Look up the role from the database on every request — `requireAuth` reads `userId` from the token, then queries MongoDB for the user's current role.

### Decision

The user's role is embedded in the JWT payload at login time alongside `userId`. The `requireAuth` middleware reads `req.role` from the verified token payload, with no database query.

### Rationale

- A database lookup on every request adds a round-trip to MongoDB for every authenticated API call. At internship scale this is tolerable, but it is wasted I/O for a field that almost never changes.
- Roles in this platform are assigned at registration and are not modifiable via any API endpoint (ROLE-09). There is no scenario where a user's role changes between logins, so the token cannot become stale with respect to role.
- The JWT signature already prevents tampering: a user cannot change `role: "student"` to `role: "teacher"` in the payload without invalidating the signature.
- This is the same pattern used in the Excaliber project and is well understood by the team.

### Consequences

**Positive:**
- Zero additional DB queries per request for role resolution.
- `requireRole()` middleware is a simple array membership check on `req.role` — no async code, no DB dependency.
- Stateless server: role decisions require no shared state beyond the JWT secret.

**Negative / Trade-offs:**
- If a role change were ever needed (e.g. promoting a Teacher to HOD), it would not take effect until the user's current access token expires (up to 15 minutes). The user would need to log out and back in. Given that role changes are out of scope for v2.0, this is an acceptable limitation.
- The JWT payload is base64-encoded and readable by the client. The role is not secret information, but developers should be aware the payload is not encrypted.

---

<a name="adr-008"></a>
## ADR-008 — Export JSON Built at Download Time From Live Data

**Status**: Accepted  
**Date**: June 2026

### Context

When a Teacher exports a question set, the server needs to produce a JSON file. Two approaches were considered:

1. **Pre-built**: Generate and store the export file (or a serialised version) when questions are first generated. Serve the cached file on export.
2. **On-demand**: Build the export JSON fresh from the live `QuestionSet` document at the moment the Teacher clicks Export.

### Decision

The export JSON is built on-demand at download time. The server reads the current state of `QuestionSet.questionBlocks` from MongoDB, runs the full validation pass, serialises the result, and returns it as a file attachment. No export file is stored.

### Rationale

- Questions can be edited after generation (EDIT-01). If the export file were pre-built, it would go stale the moment a Teacher edited a question. The on-demand approach guarantees the export always reflects the current state of the set.
- Re-generation (REGEN-01) replaces question blocks. A pre-built file would need to be invalidated and rebuilt on every regeneration — effectively making it on-demand anyway.
- The export validation (EXP-02, EXP-03, EXP-04) must run at download time regardless of approach, since it checks the live `totalMarks` sum and ID uniqueness. Running validation at generation time and caching the result would require re-running it after every subsequent edit.
- Storing export files adds storage overhead and a cache invalidation problem with no benefit at the current scale.
- Building the JSON from an in-memory document is fast (< 100ms for any realistic question set size). There is no performance argument for caching.

### Consequences

**Positive:**
- The exported file always reflects the Teacher's most recent edits — no stale data.
- No file storage infrastructure needed.
- Validation and serialisation are a single code path, making it easy to reason about what the export contains.

**Negative / Trade-offs:**
- Every export triggers a DB read and a validation pass. For very large sets with many questions, this adds a small but non-zero latency. Not a concern at current scale.
- If the same Teacher exports repeatedly, there is no caching benefit. Each export is a fresh computation. Given that export is a deliberate action (not a background poll), this is acceptable.

---

<a name="adr-009"></a>
## ADR-009 — PDF Text Extracted and Discarded — Binary Not Stored

**Status**: Accepted  
**Date**: June 2026

### Context

When a Teacher uploads a PDF, the server extracts its text content. The question was whether to also store the original PDF binary (in MongoDB, GridFS, or cloud storage like S3) alongside the extracted text.

### Decision

Only the extracted text is persisted in `QuestionSet.sourceText`. The PDF binary is processed in memory during the upload request and discarded immediately after extraction. No binary is stored.

### Rationale

- The only downstream use of the source material is as context for the AI generation prompt. The AI receives plain text — it cannot process a PDF binary directly. Once the text is extracted, the binary has no further purpose in the current feature set.
- Storing PDF binaries adds storage overhead, increases document size (or requires GridFS/S3), and introduces a file lifecycle management concern (when to delete, how to retrieve) with no corresponding feature benefit.
- Copyright and data minimisation considerations: storing uploaded institutional PDFs (textbook chapters, exam papers) introduces a data retention obligation. Extracting only the text and discarding the binary reduces the sensitivity of what is stored.
- Re-generation from the same source is fully supported: `sourceText` is persisted on the `QuestionSet` and is available for every subsequent `generate` or `regenerate` call without re-uploading.

### Consequences

**Positive:**
- No file storage infrastructure needed (no GridFS, no S3).
- Smaller DB documents — `sourceText` is a plain string, not a binary blob.
- Reduced data retention risk around copyrighted source material.

**Negative / Trade-offs:**
- The original PDF cannot be retrieved or re-downloaded from the platform after upload. If the Teacher needs the original file, they must keep their own copy.
- If future features require re-extraction with a different parser (e.g. OCR for scanned PDFs), the binary is not available and the Teacher would need to re-upload.
- `sourceText` extraction fidelity depends entirely on `pdf-parse`. If the parser misses formatting (tables, lists), the AI receives degraded context. Storing the binary would allow a future migration to a better parser without re-upload.

---

<a name="adr-010"></a>
## ADR-010 — Groq Over Other LLM Providers

**Status**: Accepted  
**Date**: June 2026

### Context

The generation pipeline requires an LLM that can follow structured JSON output instructions reliably and handle the per-type prompt design. The main candidates considered were:
- Groq (llama-4-maverick-17b-128e-instruct)
- OpenAI (GPT-4o)
- Anthropic (Claude Sonnet)
- Google (Gemini)

### Decision

Groq with `llama-4-maverick-17b-128e-instruct` is used as the generation model.

### Rationale

- **Speed**: Groq's inference hardware (LPUs) delivers significantly faster token generation than GPU-based providers. For a generation pipeline that makes N parallel calls per type, lower latency per call directly reduces the Teacher's wait time.
- **Free tier**: Groq's free tier is sufficient for internship-scale usage without incurring API costs. This keeps the project deployable without a billing setup.
- **Structured output reliability**: `llama-4-maverick` handles JSON output instructions reliably in testing. The per-type prompts are explicit about schema requirements, and the model follows them with acceptable consistency.
- **Consistency with Excaliber**: The team already has Groq SDK integration experience and working retry/timeout wrappers from the Excaliber project. Reusing the same provider and wrappers reduces integration risk.
- **No vendor lock-in risk at this scope**: The generation pipeline is abstracted behind `generator.ts`. Swapping the provider requires changing only the Groq SDK calls inside `runTypeLoop()` — the rest of the pipeline (validation, ID assignment, storage) is provider-agnostic.

### Consequences

**Positive:**
- Fast inference reduces per-type generation latency.
- No API cost for internship-scale usage.
- Existing SDK wrappers and retry logic reused from Excaliber.

**Negative / Trade-offs:**
- Groq's free tier has rate limits (requests per minute, tokens per day). Parallel generation (ADR-003) increases the likelihood of hitting rate limits under concurrent Teacher usage.
- `llama-4-maverick` is an open-weight model. For highly specialised academic content (advanced university-level questions), GPT-4o or Claude may produce higher-quality output. If question quality becomes a concern, the provider can be swapped without architectural changes.
- Groq's model availability and free tier terms may change. The abstraction in `generator.ts` ensures this is a swap, not a rewrite.

---

<a name="adr-011"></a>
## ADR-011 — Zod for Both API Validation and Question Schema Validation

**Status**: Accepted  
**Date**: June 2026

### Context

The platform has two distinct validation needs:
1. **API input validation** — validating request bodies (e.g. `typeConfig`, `count`, `marksPerQuestion`) at the route level before any business logic runs.
2. **Question schema validation** — validating AI-generated question objects against the per-type schemas defined in the PRD, both post-generation and pre-export.

The question was whether to use a single library for both concerns or separate tools (e.g. Joi for API validation, custom checks for question schemas).

### Decision

Zod is used as the single validation library for both API input schemas and question type schemas. All seven question type schemas are implemented as Zod schemas in `server/src/validation/schemas/`.

### Rationale

- Using one library for both concerns means one API to learn, one set of error message conventions, and one type inference path (Zod schemas produce TypeScript types via `z.infer<>`).
- Zod's `.strip()` mode (the default) silently removes unknown fields from parsed objects. This enforces the PRD rule "no extra fields beyond the defined schema" without throwing an error — excess AI-generated fields are cleaned up automatically.
- Zod is already the validation standard in the Excaliber codebase, so the team is familiar with it.
- The question schema Zod definitions serve double duty: they validate AI output at generation time and again at export time via `validateExportSet()`. The same schema code runs in both contexts — no duplication.
- Zod refinements (`.refine()`) allow expressing cross-field rules, such as `correctAnswer must be a non-empty array` for `multiSelect` or `options must have at least 2 items` for `multipleChoice`, which cannot be expressed with basic type annotations alone.

### Consequences

**Positive:**
- Single library, single mental model for all validation in the project.
- TypeScript types derived from Zod schemas keep API handlers and validation logic in sync automatically.
- Unknown AI-generated fields are stripped silently — no manual key filtering needed.
- Refinements can express complex per-type rules (minimum array lengths, non-empty strings) concisely.

**Negative / Trade-offs:**
- Zod schemas for all seven question types plus their sub-objects (question, options, correctAnswer variants) add meaningful boilerplate. Each schema file requires careful maintenance.
- Zod's error output is verbose by default. API error responses need a formatting layer to extract human-readable messages from `ZodError.issues`.
- `.strip()` mode means the server silently accepts and discards unexpected fields from AI output rather than flagging them. This can hide prompt instruction failures where the AI includes extra metadata. Developers should log stripped field names during development.

---

<a name="adr-012"></a>
## ADR-012 — GenerationRun as a Separate Audit Collection

**Status**: Accepted  
**Date**: June 2026

### Context

The PRD requires that every generation run be logged with role, timestamp, and per-type outcome, and that this data be visible to HODs and Principals via the analytics endpoint. The question was where to store this audit data:

1. Embedded in the `QuestionSet` document (similar to `exportHistory`).
2. As a separate `generationruns` collection with one document per run.

### Decision

Generation run data is stored in a separate `generationruns` collection. Each call to `POST /api/sets/:id/generate` or `POST /api/sets/:id/regenerate` creates one `GenerationRun` document.

### Rationale

- **Analytics query patterns differ from set access patterns.** The analytics endpoint aggregates across all runs from all teachers in a department or institution. This requires querying across many `setId`s and many `teacherId`s — a cross-document aggregation that is natural in a collection but expensive if audit data is embedded in each `QuestionSet`.
- **Embedding would bloat the QuestionSet document over time.** A Teacher who regenerates types many times would accumulate an unbounded array of run records inside the set document. Unlike `exportHistory` (rare, small entries), generation runs can be numerous and contain arrays of type names and token counts.
- **Separation of concerns.** The `QuestionSet` document is the authoritative record of the current question state. The `GenerationRun` collection is the historical audit trail of how the state was arrived at. Keeping them separate prevents the audit concern from polluting the content concern.
- **Independent retention policy.** The PRD and requirements (AUD-01) imply audit records should be retained for a defined period (12 months per schema.md). A separate collection makes it straightforward to apply a TTL index or a pruning job without touching question content.

### Consequences

**Positive:**
- Analytics queries aggregate directly over `generationruns` with appropriate indexes — no need to unwind nested arrays from `QuestionSet` documents.
- `QuestionSet` documents stay focused on question content; they do not grow with audit history.
- Separate retention policy applied to the audit collection without affecting question data.
- `GenerationRun` documents can be written even if the associated `QuestionSet` update fails (fail-safe audit logging).

**Negative / Trade-offs:**
- Loading full generation history for a specific set requires a second query against `generationruns` filtered by `setId`. This is an additional DB query for any view that shows both question content and run history.
- Referential integrity between `GenerationRun.setId` and `QuestionSet._id` is enforced only at the application layer — MongoDB does not cascade deletes. If a set is deleted, its `GenerationRun` records become orphaned. A cleanup job would be needed if set deletion is introduced.
