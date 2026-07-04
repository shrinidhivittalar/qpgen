import { z } from 'zod';

export const TypeConfigZodSchema = z.object({
  type:             z.string(),
  count:            z.number().int().positive(),
  marksPerQuestion: z.number().positive(),
}).strip();
