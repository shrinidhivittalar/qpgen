import { z } from 'zod';

export const MapSkillSchema = z.object({
  id:             z.number().optional(),
  marks:          z.number().positive(),
  explanation:    z.string().min(1),
  instruction:    z.string().min(1),
  items:          z.array(z.string().min(1)).min(2),
  totalToAttempt: z.number().int().positive(),
  modelAnswer:    z.array(z.string().min(1)).min(1),
}).strip();

export type MapSkillQuestion = z.infer<typeof MapSkillSchema>;
