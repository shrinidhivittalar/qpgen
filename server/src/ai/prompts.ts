import { QuestionType } from '../validation/schemaMap.js';
import { DIFFICULTY_INSTRUCTIONS } from './difficulty.js';
import { getExemplars } from './exemplarRetrieval.js';
import { Strategy } from './strategyPicker.js';

// One JSON example per type — derived directly from the Zod schemas so there
// is zero drift between what the prompt asks for and what Zod validates.
const SCHEMA_TEXT: Record<QuestionType, string> = {
  fillInBlanks: `[
  {
    "id": 1,
    "marks": <number>,
    "explanation": "<non-empty string>",
    "question": { "hide_text": false, "text": "<sentence with ___ blank>", "read_text": false, "image": "" },
    "correctAnswer": "<string>",
    "alternatives": ["<alternate spelling>"]
  }
]`,

  multipleChoice: `[
  {
    "id": 1,
    "marks": <number>,
    "explanation": "<non-empty string>",
    "question": { "hide_text": false, "text": "<question text>", "read_text": false, "image": "" },
    "options": [
      { "hide_text": false, "text": "<option A>", "read_text": false, "image": "" },
      { "hide_text": false, "text": "<option B>", "read_text": false, "image": "" }
    ],
    "correctAnswer": "<text of correct option>"
  }
]`,

  multiSelect: `[
  {
    "id": 1,
    "marks": <number>,
    "explanation": "<non-empty string>",
    "question": { "hide_text": false, "text": "<question text>", "read_text": false, "image": "" },
    "options": [
      { "hide_text": false, "text": "<option A>", "read_text": false, "image": "" },
      { "hide_text": false, "text": "<option B>", "read_text": false, "image": "" }
    ],
    "correctAnswer": ["<correct option text>", "<another correct option text>"]
  }
]`,

  matchTheFollowing: `[
  {
    "id": 1,
    "marks": <number>,
    "explanation": "<non-empty string>",
    "question": { "hide_text": false, "text": "<instruction text>", "read_text": false, "image": "" },
    "leftItems": ["<term A>", "<term B>"],
    "rightItems": ["<definition 1>", "<definition 2>"],
    "correctAnswer": [{ "left": "<term A>", "right": "<definition 1>" }]
  }
]`,

  reordering: `[
  {
    "id": 1,
    "marks": <number>,
    "explanation": "<non-empty string>",
    "question": { "hide_text": false, "text": "<instruction text>", "read_text": false, "image": "" },
    "items": ["<step 3>", "<step 1>", "<step 2>"],
    "correctAnswer": ["<step 1>", "<step 2>", "<step 3>"]
  }
]`,

  sorting: `[
  {
    "id": 1,
    "marks": <number>,
    "explanation": "<non-empty string>",
    "question": { "hide_text": false, "text": "<instruction text>", "read_text": false, "image": "" },
    "categories": ["<category A>", "<category B>"],
    "items": ["<item 1>", "<item 2>", "<item 3>"],
    "correctAnswer": { "<category A>": ["<item 1>"], "<category B>": ["<item 2>", "<item 3>"] }
  }
]`,

  trueFalse: `[
  {
    "id": 1,
    "marks": <number>,
    "explanation": "<non-empty string>",
    "question": { "hide_text": false, "text": "<statement>", "read_text": false, "image": "" },
    "correctAnswer": true
  }
]`,
};

const STRATEGY_INSTRUCTIONS: Record<Strategy, (base: string | null) => string> = {
  fresh:    ()     => '',
  rephrase: (base) => `A similar question appeared in a previous exam:\n"${base}"\nRephrase this to test the same underlying concept with different wording, a different scenario, or different numerical values. Do NOT change what concept is being tested. Do NOT reuse the original sentence structure.`,
  variant:  (base) => `A previous exam tested this concept:\n"${base}"\nGenerate a NEW question on the same broad concept but from a different angle — a different sub-topic, a different question framing, or applied to a different scenario. Do not reproduce the original question's wording or specific scenario.`,
  reuse:    (base) => `Reformat this exact question to match the schema below, changing nothing about its content, wording, or answer:\n"${base}"`,
};

const TONE_INSTRUCTION: Record<string, string> = {
  'formal-board-exam': 'Use the formal, precise register of a national board examination paper — no casual phrasing, no contractions.',
  'neutral':           'Use clear, plain instructional language.',
  'conversational':    'Use an approachable, conversational tone while staying precise.',
};

export async function buildPrompt(
  type:        QuestionType,
  sourceText:  string,
  count:       number,
  teacherId:   string,
  difficulty:  'easy' | 'moderate' | 'hard',
  tone:        'formal-board-exam' | 'neutral' | 'conversational',
  bankId?:     string,
  subjectHint?: string,
  dedupeHint?: string,
  strategy?:     Strategy,
  baseQuestion?: string | null,
  chapterName?:  string,
): Promise<{ system: string; user: string }> {
  const resolvedStrategy    = strategy    ?? 'fresh';
  const resolvedBase        = baseQuestion ?? null;
  const resolvedChapterName = chapterName ?? '';

  const schemaBlock = SCHEMA_TEXT[type];
  const exemplars   = await getExemplars(teacherId, type, { bankId, subjectHint });

  const toneInstruction       = TONE_INSTRUCTION[tone];
  const difficultyInstruction = DIFFICULTY_INSTRUCTIONS[difficulty];
  const strategyInstruction   = STRATEGY_INSTRUCTIONS[resolvedStrategy](resolvedBase);

  const exemplarBlock = exemplars.length > 0
    ? `\n\nHere are example questions matching the required style and difficulty:\n${exemplars.map((e, i) => `${i + 1}. ${e}`).join('\n')}\nMatch this style exactly.`
    : '';

  const strategyBlock = strategyInstruction ? `\n\n${strategyInstruction}` : '';

  const system = `You generate ${type} questions strictly matching this schema:
${schemaBlock}
Generate exactly ${count} question${count === 1 ? '' : 's'} from the source material below.
${toneInstruction}
${difficultyInstruction}
Every question must include a non-empty "explanation" field that justifies the correct answer. Return ONLY the fields shown in the schema — no extra fields whatsoever.${exemplarBlock}${strategyBlock}
Return a raw JSON array only. No markdown formatting, no code fences, no commentary before or after the array.`;

  const chapterPrefix = resolvedChapterName
    ? `This question should be based on material from the chapter "${resolvedChapterName}".\n\n`
    : '';

  const user = dedupeHint
    ? `${chapterPrefix}Source material:\n${sourceText}\n\n${dedupeHint} Generate ${count} NEW distinct question${count === 1 ? '' : 's'}.`
    : `${chapterPrefix}Source material:\n${sourceText}`;

  return { system, user };
}
