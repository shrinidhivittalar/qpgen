import { z } from 'zod';
import { baseQuestionSchema } from './base.js';

// EC-GEN-20: z.boolean() does NOT coerce — string "true" will fail.
// Never use z.coerce.boolean() here.
export const TrueFalseSchema = baseQuestionSchema.extend({
  correctAnswer: z.boolean(),
}).refine(
  (data) => !data.question.text.trim().endsWith('?'),
  { message: 'True/False question.text must be a declarative statement, not a question ending with ?' },
);

export type TrueFalseQuestion = z.infer<typeof TrueFalseSchema>;
