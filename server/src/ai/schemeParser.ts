import Groq from 'groq-sdk';
import { z } from 'zod';
import { parseAiJsonArray } from './generator.js';

export type TypeConfig = { type: string; count: number; marksPerQuestion: number };

const VALID_TYPES = [
  'fillInBlanks', 'multipleChoice', 'multiSelect',
  'matchTheFollowing', 'reordering', 'sorting', 'trueFalse',
] as const;

const ParsedConfigSchema = z.array(
  z.object({
    type:             z.enum(VALID_TYPES),
    count:            z.number().int().positive(),
    marksPerQuestion: z.number().min(0.5),
  }),
);

const SYSTEM_PROMPT = `You are an expert at parsing question paper schemes from educational documents.

The valid question types are:
- fillInBlanks      — fill-in-the-blank questions
- multipleChoice    — MCQ with a single correct answer (also called "objective", "MCQ", "choose the best answer")
- multiSelect       — MCQ with multiple correct answers (also called "select all that apply")
- matchTheFollowing — match items from column A to column B
- reordering        — arrange items in the correct order (also called "sequence", "arrange")
- sorting           — sort items into named categories (also called "classify", "categorise")
- trueFalse         — true or false statement questions

Given the text of a question paper scheme, identify question sections and extract:
1. The question type (use ONLY the exact strings listed above — infer from descriptions/keywords if needed)
2. The count of questions in that section (MUST be a positive integer)
3. The marks per question (MUST be a positive number, e.g. 1, 2, 5, 10)

IMPORTANT RULES:
- ONLY include a type if you can confidently identify BOTH a positive count AND positive marks per question from the text.
- NEVER include a type with count = 0 or marksPerQuestion = 0.
- If the scheme does not specify a particular question type, omit it entirely.
- If a section says "Part A: 10 questions × 2 marks", that is 10 questions worth 2 marks each.
- Map unlabelled "short answer" → fillInBlanks, "objective/MCQ" → multipleChoice, "T/F" → trueFalse.

Return ONLY a JSON array with no markdown fences and no explanation. Example:
[
  { "type": "multipleChoice", "count": 10, "marksPerQuestion": 1 },
  { "type": "fillInBlanks", "count": 5, "marksPerQuestion": 2 }
]

If no question types can be confidently identified with positive counts and marks, return an empty array: []`;

let _groq: Groq | null = null;
function getGroq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';

export async function parseScheme(rawText: string): Promise<TypeConfig[]> {
  const truncated = rawText.slice(0, 8000); // keep within token budget

  let raw: string;
  try {
    const completion = await getGroq().chat.completions.create({
      model:    GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `Parse this scheme:\n\n${truncated}` },
      ],
      temperature: 0,
    });
    raw = completion.choices[0]?.message?.content ?? '[]';
  } catch (err) {
    throw new Error('SCHEME_PARSE_AI_ERROR');
  }

  const rawItems = parseAiJsonArray(raw);
  // Filter out any zero-count or zero-marks entries the AI returned as placeholders
  const items = Array.isArray(rawItems)
    ? rawItems.filter((x: any) => x?.count > 0 && x?.marksPerQuestion > 0)
    : [];
  console.log('[schemeParser] AI raw response:', raw.slice(0, 500));
  console.log('[schemeParser] parsed items after filter:', JSON.stringify(items));
  const result = ParsedConfigSchema.safeParse(items);
  if (!result.success || result.data.length === 0) {
    console.error('[schemeParser] validation failed:', result.success ? 'empty array' : result.error.message);
    throw new Error('SCHEME_PARSE_INVALID');
  }

  return result.data;
}
