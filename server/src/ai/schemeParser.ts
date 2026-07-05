import Groq from 'groq-sdk';
import { z } from 'zod';
import { withRetry, withTimeout } from '../lib/retry.js';
import { parseAiJsonArray } from './generator.js';
import { TypeConfigZodSchema } from '../validation/schemas/typeConfig.js';

export type TypeConfig = {
  type: string;
  count: number;
  marksPerQuestion: number;
};

const VALID_TYPES = [
  'fillInBlanks', 'multipleChoice', 'multiSelect', 'matchTheFollowing',
  'reordering', 'sorting', 'trueFalse',
] as const;

const SCHEME_PARSE_PROMPT = `You are an expert at reading Indian school and university exam paper schemes, blueprints, and marking schemes (CBSE, ICSE, state boards, university patterns).

These documents use varied terminology. Your job is to extract the question configuration and map each section to one of these EXACT type names:
  fillInBlanks | multipleChoice | multiSelect | matchTheFollowing | reordering | sorting | trueFalse

TERMINOLOGY MAPPING GUIDE — use this to map Indian exam language to type names:
  → multipleChoice : "Objective Type", "MCQ", "Multiple Choice", "Choose the correct option",
                     "Choose the best answer", questions with options (A)(B)(C)(D) or (i)(ii)(iii)(iv),
                     "Objective Questions", "Choose", "Select the correct"
  → fillInBlanks   : "Fill in the Blanks", "Fill in", "Complete the sentence", "Short Answer" (1-2 marks),
                     "Very Short Answer", "VSA", "SA", blank/underline questions
  → trueFalse      : "True or False", "T/F", "State True/False", "Correct/Incorrect"
  → matchTheFollowing : "Match the Following", "Match Column A with Column B", "Match the pairs"
  → multiSelect    : "Select ALL that apply", "Choose all correct", "Multiple correct answers"
  → reordering     : "Arrange in order", "Sequence the steps", "Rearrange"
  → sorting        : "Classify", "Categorise", "Group", "Sort into categories"

COUNT EXTRACTION — look for patterns like:
  "10 x 1 = 10"  → count: 10, marksPerQuestion: 1
  "5 × 2 = 10"   → count: 5,  marksPerQuestion: 2
  "Answer any 4 out of 6" → count: 4 (use the "any N" number, not the total)
  "(24 Marks)" with N questions → marksPerQuestion = 24 / N
  If a section has sub-questions of mixed marks, use the most common marks value.

RULES:
  - ONLY output types from the list above. Never invent type names.
  - ONLY include a type if you can determine a positive count AND positive marks.
  - If a section mixes types (e.g. both MCQ and fill-in-blank sub-parts), split into two entries.
  - "Subjective Type", "Long Answer", "Essay" questions do NOT map to any supported type — skip them.
  - Prefer specific evidence in the text over guessing.

Return ONLY a raw JSON array, no markdown fences, no explanation:
[{ "type": "multipleChoice", "count": 20, "marksPerQuestion": 1 }, { "type": "fillInBlanks", "count": 5, "marksPerQuestion": 2 }]`;

let _groq: Groq | null = null;
function getGroq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

export async function parseScheme(rawText: string): Promise<TypeConfig[]> {
  const response = await withRetry(
    () => withTimeout(
      () => getGroq().chat.completions.create({
        model:    process.env.GROQ_MODEL ?? 'llama-4-maverick-17b-128e-instruct',
        messages: [
          { role: 'system', content: SCHEME_PARSE_PROMPT },
          { role: 'user',   content: rawText.slice(0, 8000) },
        ],
        temperature: 0.2,
      }),
      30_000,
      'schemeParser',
    ),
    3,
  );

  const raw    = response.choices[0]?.message?.content ?? '';
  const parsed = parseAiJsonArray(raw);

  const validated = z.array(TypeConfigZodSchema).safeParse(parsed);
  if (!validated.success || validated.data.length === 0) {
    throw new Error('SCHEME_PARSE_FAILED');
  }

  const clean = validated.data.filter(tc => VALID_TYPES.includes(tc.type as typeof VALID_TYPES[number]));
  if (clean.length === 0) throw new Error('SCHEME_PARSE_FAILED');

  // Merge duplicate type entries (e.g. Part A + Part B both mapping to multipleChoice)
  // by summing counts; keep marksPerQuestion from the first occurrence.
  const merged = new Map<string, TypeConfig>();
  for (const tc of clean) {
    if (merged.has(tc.type)) {
      merged.get(tc.type)!.count += tc.count;
    } else {
      merged.set(tc.type, { ...tc });
    }
  }

  return Array.from(merged.values());
}
