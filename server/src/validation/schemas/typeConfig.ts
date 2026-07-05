import { z } from 'zod';

export const DifficultyLevel = z.enum(['easy', 'moderate', 'hard']);
export const ToneOption = z.enum(['formal-board-exam', 'neutral', 'conversational']);

export const TypeConfigZodSchema = z.object({
  type:             z.string(),
  count:            z.number().int().positive(),
  marksPerQuestion: z.number().positive(),
  difficulty:       DifficultyLevel.optional(),
}).strip();
