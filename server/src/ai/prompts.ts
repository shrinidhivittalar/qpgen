import { QuestionType } from '../validation/schemaMap.js';

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

export function buildPrompt(
  type: QuestionType,
  sourceText: string,
  count: number,
  dedupeHint?: string,
): { system: string; user: string } {
  const schemaBlock = SCHEMA_TEXT[type];

  const system = `You generate ${type} questions strictly matching this JSON schema:
${schemaBlock}

Generate exactly ${count} question${count === 1 ? '' : 's'}.
Every question MUST include a non-empty "explanation" field that justifies the correct answer.
Return ONLY the fields shown above — no extra fields whatsoever.
Return a raw JSON array only. No markdown formatting, no code fences, no commentary before or after the array.`;

  let userText = `Source material:\n${sourceText}`;
  if (dedupeHint) {
    userText += `\n\n${dedupeHint} Generate ${count} NEW distinct question${count === 1 ? '' : 's'}.`;
  }

  return { system, user: userText };
}
