import { z } from 'zod';

export const LongAnswerPartSchema = z.object({
  label:       z.string().min(1),
  marks:       z.number().positive(),
  question:    z.string().min(1),
  modelAnswer: z.string().min(1),
}).strip();

export const LongAnswerSchema = z.object({
  id:          z.number().optional(),
  marks:       z.number().positive(),
  explanation: z.string().min(1),
  preamble:    z.string().min(1),
  parts:       z.array(LongAnswerPartSchema).min(1),
}).strip();

export type LongAnswerQuestion = z.infer<typeof LongAnswerSchema>;
export type LongAnswerPart     = z.infer<typeof LongAnswerPartSchema>;
