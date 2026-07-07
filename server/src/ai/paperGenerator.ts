import Groq from 'groq-sdk';
import { withRetry, withTimeout } from '../lib/retry.js';
import { buildLongAnswerPrompt } from './prompts.js';
import { parseAiJsonArray } from './generator.js';
import { schemaMap, QuestionType } from '../validation/schemaMap.js';
import { LongAnswerSchema } from '../validation/schemas/longAnswer.js';
import { createLimiter } from '../lib/concurrency.js';
import { logger } from '../lib/logger.js';
import type { PaperStructure, PaperQuestion, PaperSection } from '../types/paperStructure.js';
import type { ChapterInput } from './slotAllocator.js';

let _groq: Groq | null = null;
function getGroq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-4-maverick-17b-128e-instruct';

function buildSlotSystemPrompt(type: QuestionType, marks: number, tone: string): string {
  const toneNote = tone === 'formal-board-exam' ? 'Formal board-exam register.' : 'Clear, plain language.';
  const m = marks;
  const q = `{"hide_text":false,"text":"question text here","read_text":false,"image":""}`;
  const opt = (t: string) => `{"hide_text":false,"text":"${t}","read_text":false,"image":""}`;

  const schemaMap: Partial<Record<QuestionType, string>> = {
    multipleChoice:   `[{"marks":${m},"question":${q},"options":[${opt('option A')},${opt('option B')},${opt('option C')},${opt('option D')}],"correctAnswer":"option A","explanation":"why A is correct"}]`,
    trueFalse:        `[{"marks":${m},"question":{"hide_text":false,"text":"A declarative statement (not a question).","read_text":false,"image":""},"correctAnswer":true,"explanation":"why this is true"}]`,
    fillInBlanks:     `[{"marks":${m},"question":{"hide_text":false,"text":"The _____ is used to...","read_text":false,"image":""},"correctAnswer":"answer word","alternatives":["alternate phrasing"],"explanation":"why this answer"}]`,
    assertionReason:  `[{"marks":${m},"assertion":"Assertion statement.","reason":"Reason statement.","options":["Both A and R are correct, and R is the correct explanation of A","Both A and R are correct, but R is not the correct explanation of A","A is correct, but R is incorrect","A is incorrect, but R is correct"],"correctAnswer":"Both A and R are correct, and R is the correct explanation of A","explanation":"why"}]`,
    shortAnswer:      `[{"marks":${m},"question":${q},"wordLimit":{"min":${m*20},"max":${m*40}},"modelAnswer":"model answer prose","markingScheme":[{"point":"key point","marks":${m}}],"explanation":"marking guidance"}]`,
    multiSelect:      `[{"marks":${m},"question":${q},"options":[${opt('option A')},${opt('option B')},${opt('option C')},${opt('option D')}],"correctAnswer":["option A","option B"],"explanation":"why A and B are correct"}]`,
    matchTheFollowing:`[{"marks":${m},"question":${q},"leftItems":["Term 1","Term 2","Term 3"],"rightItems":["Def 1","Def 2","Def 3","Distractor"],"correctAnswer":[{"left":"Term 1","right":"Def 1"},{"left":"Term 2","right":"Def 2"},{"left":"Term 3","right":"Def 3"}],"explanation":"why these pairs"}]`,
    reordering:       `[{"marks":${m},"question":${q},"items":["Step C","Step A","Step B"],"correctAnswer":["Step A","Step B","Step C"],"explanation":"why this order"}]`,
    sorting:          `[{"marks":${m},"question":${q},"categories":["Cat A","Cat B"],"items":["item1","item2","item3","item4"],"correctAnswer":{"Cat A":["item1","item3"],"Cat B":["item2","item4"]},"explanation":"why"}]`,
  };

  const schema = schemaMap[type] ?? schemaMap.shortAnswer!;

  const mcqStemNote = (type === 'multipleChoice' || type === 'multiSelect')
    ? `\nSTEM RULE (mandatory): The question.text MUST be an incomplete statement or a "Which of the following..." prompt that one of the four options directly answers.
BAD stems (forbidden): "What is X?", "Explain X", "How does X work?", "What are the benefits of X?"
GOOD stems: "Which of the following best describes X?", "The primary purpose of X is ___.", "X is characterised by which of the following?", "In the context of Y, which statement about X is correct?"
Each option MUST be a short, plausible completion or answer — not a placeholder like "option A".
CRITICAL: correctAnswer MUST be copied CHARACTER-FOR-CHARACTER from one of the options[i].text values. Do NOT use "A", "B", "C" or a paraphrase — use the exact option text string.`
    : '';

  return `[QUESTION_TYPE:${type}]
You are a question paper setter. Generate exactly 1 ${type} question worth ${m} mark(s) from the source text.
${toneNote} Ground the question in concepts and examples actually present in the source. Do not invent hospital scenarios.
${mcqStemNote}
Return ONLY a raw JSON array — no markdown, no extra fields, no commentary. Use this exact schema:
${schema}`;
}

// Parse single JSON object (long answer returns one object, not an array)
function parseJsonObject(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// Pick the best chapter for a question slot.
// Priority: exact chapterId → unitRef substring match → round-robin by globalIndex.
function pickChapter(
  question:    PaperQuestion,
  chapters:    ChapterInput[],
  globalIndex: number,
): ChapterInput {
  if (chapters.length === 0) throw new Error('No chapters provided');

  if (question.chapterId) {
    const match = chapters.find(c => c.id === question.chapterId);
    if (match) return match;
  }

  if (question.unitRef) {
    const ref = question.unitRef.toLowerCase();
    const match = chapters.find(c =>
      c.name.toLowerCase().includes(ref) || ref.includes(c.name.toLowerCase()),
    );
    if (match) return match;
  }

  return chapters[globalIndex % chapters.length];
}

// Pick a text excerpt window for the question.
// Uses totalWindows (= total slot count) so each slot gets a unique segment of the source.
// Window size is 2000 chars so a single figure caption or table can't fill the whole window.
function pickExcerpt(sourceText: string, offsetIndex: number, windowSize = 2000, totalWindows = 4): string {
  if (sourceText.length <= windowSize) return sourceText;
  const segments = Math.max(totalWindows, 4);
  const step     = Math.floor(sourceText.length / segments);
  const start    = (offsetIndex * step) % (sourceText.length - windowSize);
  return sourceText.slice(start, start + windowSize);
}

async function generateObjectiveQuestion(
  question:    PaperQuestion,
  chapter:     ChapterInput,
  excerpt:     string,
  options:     PaperGenerateOptions,
  requestId?:  string,
): Promise<object | null> {
  const type = question.type as QuestionType;
  const schema = schemaMap[type];
  if (!schema) return null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const system = buildSlotSystemPrompt(type, question.marks, options.tone ?? 'formal-board-exam');
      const user   = `SOURCE TEXT:\n${excerpt}`;

      const response = await withRetry(
        () => withTimeout(
          () => getGroq().chat.completions.create({
            model:    GROQ_MODEL,
            messages: [
              { role: 'system', content: system },
              { role: 'user',   content: user },
            ],
            temperature: 0.7,
          }),
          30_000,
          `paperGen:${type}:q${question.number}`,
        ),
        2,
      );

      const raw = response.choices[0]?.message?.content ?? '';
      const arr = parseAiJsonArray(raw);
      if (arr.length === 0) continue;

      const parsed = schema.safeParse(arr[0]);
      if (parsed.success) {
        return { ...parsed.data, marks: question.marks };
      }

      logger.info('paper_gen_validation_fail', {
        requestId,
        questionNumber: question.number,
        type,
        attempt,
        issues: parsed.error.issues.slice(0, 2).map(i => i.message),
      });
    } catch (err) {
      logger.warn('paper_gen_slot_error', {
        requestId,
        questionNumber: question.number,
        type,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}

async function generateLongAnswerQuestion(
  question:    PaperQuestion,
  chapter:     ChapterInput,
  excerpt:     string,
  options:     PaperGenerateOptions,
  requestId?:  string,
): Promise<object | null> {
  const subPartCount = question.subPartCount ?? 2;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { system, user } = buildLongAnswerPrompt(excerpt, {
        tone:        options.tone,
        chapterName: chapter.name,
        marks:       question.marks,
        subPartCount,
      });

      const response = await withRetry(
        () => withTimeout(
          () => getGroq().chat.completions.create({
            model:    GROQ_MODEL,
            messages: [
              { role: 'system', content: system },
              { role: 'user',   content: user },
            ],
            temperature: 0.6,
          }),
          45_000,
          `paperGen:longAnswer:q${question.number}`,
        ),
        2,
      );

      const raw    = response.choices[0]?.message?.content ?? '';
      const parsed = parseJsonObject(raw);
      const result = LongAnswerSchema.safeParse(parsed);

      if (result.success) {
        return { ...result.data, marks: question.marks };
      }

      logger.info('paper_gen_validation_fail', {
        requestId,
        questionNumber: question.number,
        type: 'longAnswer',
        attempt,
        issues: result.error.issues.slice(0, 2).map(i => i.message),
      });
    } catch (err) {
      logger.warn('paper_gen_slot_error', {
        requestId,
        questionNumber: question.number,
        type: 'longAnswer',
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}

export interface PaperGenerateOptions {
  teacherId:  string;
  tone?:      'formal-board-exam' | 'neutral' | 'conversational';
  requestId?: string;
}

export interface PaperGenerateResult {
  structure:     PaperStructure;
  totalSlots:    number;
  filledSlots:   number;
  failedSlots:   number;
  tokensEstimate: number;
}

// Deep-clone the structure and fill each question slot in parallel
// (max 3 concurrent Groq calls via limiter).
export async function generatePaper(
  structure:  PaperStructure,
  chapters:   ChapterInput[],
  options:    PaperGenerateOptions,
): Promise<PaperGenerateResult> {
  if (chapters.length === 0) throw new Error('At least one chapter is required.');

  // Collect all question slots with section-aware offsets.
  // Each section starts at a different region of the source so same-numbered
  // questions across sections don't hit the same excerpt window.
  const slots: Array<{
    section:      PaperSection;
    question:     PaperQuestion;
    globalIndex:  number;
    excerptIndex: number;
  }> = [];

  const questionsPerSection = Math.ceil(
    structure.sections.reduce((n, s) => n + s.questions.length, 0) /
    Math.max(structure.sections.length, 1),
  );

  structure.sections.forEach((section, si) => {
    section.questions.forEach((question, qi) => {
      slots.push({
        section,
        question,
        globalIndex:  slots.length,
        excerptIndex: si * questionsPerSection + qi,
      });
    });
  });

  const limiter = createLimiter(2);
  let filledSlots = 0;
  let failedSlots = 0;

  const settled = await Promise.allSettled(
    slots.map(({ question, globalIndex, excerptIndex }) =>
      limiter(async () => {
        const chapter = pickChapter(question, chapters, globalIndex);
        const excerpt = pickExcerpt(chapter.sourceText, excerptIndex, 1500, slots.length);

        const generated = question.type === 'longAnswer'
          ? await generateLongAnswerQuestion(question, chapter, excerpt, options, options.requestId)
          : await generateObjectiveQuestion(question, chapter, excerpt, options, options.requestId);

        return { globalIndex, generated };
      }),
    ),
  );

  // Rebuild the structure keyed by globalIndex (not question.number, which repeats across sections).
  const generatedMap = new Map<number, object | null>();
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      generatedMap.set(r.value.globalIndex, r.value.generated);
    }
  }

  // Fill sections in the same order slots were built so globalIndex matches.
  let gi = 0;
  const filledSections: PaperSection[] = structure.sections.map(section => ({
    ...section,
    questions: section.questions.map(q => {
      const generated = generatedMap.get(gi++);
      if (generated != null) {
        filledSlots++;
        return { ...q, generated, error: undefined };
      }
      failedSlots++;
      return { ...q, generated: null, error: 'Generation failed after 3 attempts.' };
    }),
  }));

  const filledStructure: PaperStructure = {
    ...structure,
    sections: filledSections,
  };

  return {
    structure:      filledStructure,
    totalSlots:     slots.length,
    filledSlots,
    failedSlots,
    tokensEstimate: slots.length * 800,
  };
}
