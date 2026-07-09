import Groq from 'groq-sdk';
import { validateQuestionBlock, assignGlobalIds, QuestionBlock } from '../validation/index.js';
import { QuestionType } from '../validation/schemaMap.js';
import { buildPrompt, PromptContext } from './prompts.js';
import { withRetry, withTimeout } from '../lib/retry.js';
import { groqAcquire } from '../lib/groqLimiter.js';
import { allocateSlots, ChapterInput } from './slotAllocator.js';
import { pickStrategy, Strategy } from './strategyPicker.js';
import { createLimiter } from '../lib/concurrency.js';

// Lazy singleton — constructed only when realGenerateFn is first called so
// that importing this module in tests without GROQ_API_KEY does not throw.
let _groq: Groq | null = null;
function getGroq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';

type ToneOption = 'formal-board-exam' | 'neutral' | 'conversational';

export interface GenerationContext extends PromptContext {
  // strategyContext is separate from strategy/baseQuestion in PromptContext:
  // it carries the same values to validateQuestionBlock for similarity checks.
  strategyContext?: { strategy: Strategy; baseQuestion: string | null };
}

export type GenerateFn = (
  sourceText:       string,
  type:             QuestionType,
  count:            number,
  marksPerQuestion: number,
  dedupeHint?:      string,
  context?:         GenerationContext,
) => Promise<unknown[]>;

export type RunTypeLoopResult =
  | { status: 'success'; questions: object[] }
  | { status: 'failed'; requested: number; received: number; error: string };

const MAX_ATTEMPTS = 3;

export async function runTypeLoop(
  sourceText:       string,
  type:             QuestionType,
  targetCount:      number,
  marksPerQuestion: number,
  generateFn:       GenerateFn,
  context?:         GenerationContext,
): Promise<RunTypeLoopResult> {
  let collected: object[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const shortfall = targetCount - collected.length;

    let raw: unknown[];
    try {
      raw = await generateFn(
        sourceText,
        type,
        shortfall,
        marksPerQuestion,
        attempt > 1 ? 'Avoid duplicating previously generated questions.' : undefined,
        context,
      );
    } catch {
      // EC-GEN-08: thrown error (network, invalid JSON) = 0 received this round
      raw = [];
    }

    const { valid } = await validateQuestionBlock(
      type, raw, [],
      context?.difficulty as ('easy' | 'moderate' | 'hard') | undefined,
      context?.strategyContext,
    );
    collected = collected.concat(valid);

    if (collected.length >= targetCount) {
      collected = collected.slice(0, targetCount); // GEN-04, EC-GEN-05: trim excess
      return { status: 'success', questions: recalculateMarks(collected, marksPerQuestion) };
    }
  }

  return {
    status:    'failed',
    requested: targetCount,
    received:  collected.length,
    error:     collected.length === 0
      ? `Could not generate any ${type} questions from the source content.`
      : `Insufficient source content to generate ${targetCount} ${type} questions.`,
  };
}

// marks are server-assigned from typeConfig — the AI's value is never trusted
function recalculateMarks(questions: object[], marksPerQuestion: number): object[] {
  return questions.map(q => ({ ...q, marks: marksPerQuestion }));
}

// EC-GEN-08: strip markdown fences the model may add despite instructions,
// then parse. Returns [] on any parse failure — runTypeLoop treats that as
// 0 received and retries.
export function parseAiJsonArray(raw: string): unknown[] {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Shared Groq call — reserves a token window slot before calling the API.
// The actual HTTP call runs concurrently with others; only the reserve step
// is serialised (inside groqAcquire) to prevent window-check races.
async function callGroq(
  type:   QuestionType,
  system: string,
  user:   string,
): Promise<{ questions: unknown[]; tokens: number }> {
  await groqAcquire();
  const response = await withRetry(
    () => withTimeout(
      () => getGroq().chat.completions.create({
        model:       GROQ_MODEL,
        messages:    [
          { role: 'system', content: system },
          { role: 'user',   content: user },
        ],
        temperature: 0.7,
      }),
      30_000,
      `groq:${type}`,
    ),
    3,
  );
  const tokens = response.usage?.total_tokens ?? 0;
  const raw    = response.choices[0]?.message?.content ?? '';
  return { questions: parseAiJsonArray(raw), tokens };
}

// Convenience export for one-off calls (no token tracking).
export const realGenerateFn: GenerateFn = async (sourceText, type, count, marks, dedupeHint, context) => {
  const { system, user } = await buildPrompt(type, sourceText, count, marks, { ...context, dedupeHint });
  const { questions } = await callGroq(type, system, user);
  return questions;
};

// Factory for per-run token tracking. Each call to makeTrackedGenerateFn
// returns a fresh counter; the route calls getTokensUsed() after generateSet
// completes to obtain the total for that run.
export function makeTrackedGenerateFn(): { generateFn: GenerateFn; getTokensUsed: () => number } {
  let tokensUsed = 0;
  const generateFn: GenerateFn = async (sourceText, type, count, marks, dedupeHint, context) => {
    const { system, user } = await buildPrompt(type, sourceText, count, marks, { ...context, dedupeHint });
    const { questions, tokens } = await callGroq(type, system, user);
    tokensUsed += tokens;
    return questions;
  };
  return { generateFn, getTokensUsed: () => tokensUsed };
}

// ── Slot-based generation ─────────────────────────────────────────────────────
// Slots are grouped into batches of up to SLOT_BATCH_SIZE per API call to
// reduce the number of Groq requests and stay within the TPM window.
// Each batch shares the first slot's excerpt, chapter, and difficulty — a
// deliberate tradeoff: slightly less per-question diversity in exchange for
// 3-4× fewer API calls and dramatically shorter generation time.

const SLOT_BATCH_SIZE = 3;

export async function generateTypeViaSlots(
  type:               QuestionType,
  count:              number,
  marksPerQuestion:   number,
  chapters:           ChapterInput[],
  explicitDifficulty: 'easy' | 'moderate' | 'hard' | undefined,
  teacherId:          string,
  tone:               ToneOption,
  bankId:             string | undefined,
  limiter:            ReturnType<typeof createLimiter>,
  typeIndex:          number = 0,
  mapItems?:          string[],
): Promise<{ questions: object[]; requested: number; received: number }> {
  const slots = await allocateSlots(type, count, marksPerQuestion, chapters, explicitDifficulty, typeIndex);

  // Group slots into sequential batches to minimise API calls.
  // Each batch generates SLOT_BATCH_SIZE questions in one Groq call using
  // the lead slot's excerpt. Slots are pre-shuffled by allocateSlots so
  // chapter diversity is already encoded in the slot order.
  const batches: typeof slots[] = [];
  for (let i = 0; i < slots.length; i += SLOT_BATCH_SIZE) {
    batches.push(slots.slice(i, i + SLOT_BATCH_SIZE));
  }

  const settled = await Promise.allSettled(
    batches.map(batchSlots =>
      limiter(async () => {
        const lead = batchSlots[0];
        const batchCount = batchSlots.length;
        const { strategy, baseQuestion } = await pickStrategy(teacherId, lead.chapterId, type);

        const slotGenerateFn: GenerateFn = async (_src, _type, n, marks) => {
          const { system, user } = await buildPrompt(type, lead.sourceExcerpt, n, marks, {
            teacherId,
            bankId,
            tone,
            difficulty:   lead.difficulty,
            chapterName:  lead.chapterName,
            strategy,
            baseQuestion,
            mapItems,
          });
          const { questions } = await callGroq(type, system, user);
          return questions;
        };

        return runTypeLoop(
          lead.sourceExcerpt,
          type,
          batchCount,
          marksPerQuestion,
          slotGenerateFn,
          { strategyContext: { strategy, baseQuestion } },
        );
      }),
    ),
  );

  const questions: object[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value.status === 'success') {
      questions.push(...r.value.questions);
    }
  }

  return { questions, requested: count, received: questions.length };
}

export interface GenerationError {
  type:      string;
  requested: number;
  received:  number;
  error:     string;
}

export interface TypeConfig {
  type:             QuestionType;
  count:            number;
  marksPerQuestion: number;
  difficulty?:      'easy' | 'moderate' | 'hard';
}

// Note: if ALL counts are 0 the route layer should reject before calling
// generateSet — that boundary is enforced at the API level (Day 3), not here.
export async function generateSet(
  sourceText:  string,
  typeConfig:  TypeConfig[],
  generateFn:  GenerateFn,
  context?:    Omit<GenerationContext, 'difficulty'>,
): Promise<{ blocks: QuestionBlock[]; errors: GenerationError[] }> {
  // GEN-09, EC-GEN-01: types with count 0 are silently skipped
  const activeTypes = typeConfig.filter(tc => tc.count > 0);

  // ADR-003: Promise.allSettled so one type's unexpected throw never
  // cancels the others
  const settled = await Promise.allSettled(
    activeTypes.map(tc =>
      runTypeLoop(
        sourceText, tc.type, tc.count, tc.marksPerQuestion, generateFn,
        { ...context, difficulty: tc.difficulty },
      ).then(result => ({ type: tc.type, result })),
    ),
  );

  const blocks: QuestionBlock[] = [];
  const errors: GenerationError[] = [];

  for (const outcome of settled) {
    if (outcome.status === 'rejected') {
      // runTypeLoop should never reject (catches internally), but if it
      // somehow does, skip it — don't crash the entire generateSet call
      continue;
    }
    const { type, result } = outcome.value;
    if (result.status === 'success') {
      blocks.push({
        questionType: type,
        totalMarks:   result.questions.reduce((sum, q) => sum + ((q as Record<string, unknown>).marks as number), 0),
        status:       'success',
        questions:    result.questions,
      });
    } else {
      errors.push({
        type,
        requested: result.requested,
        received:  result.received,
        error:     result.error,
      });
    }
  }

  // ADR-004: single ID-assignment pass after all types complete
  assignGlobalIds(blocks);
  return { blocks, errors };
}
