import { z } from 'zod';

export const PAPER_QUESTION_TYPES = [
  'multipleChoice',
  'fillInBlanks',
  'trueFalse',
  'assertionReason',
  'multiSelect',
  'matchTheFollowing',
  'reordering',
  'sorting',
  'shortAnswer',
  'longAnswer',
] as const;

export type PaperQuestionType = typeof PAPER_QUESTION_TYPES[number];

export const PaperWordLimitSchema = z.object({
  min: z.number().int().nonnegative(),
  max: z.number().int().positive(),
}).refine(d => d.max >= d.min, { message: 'wordLimit.max must be >= min' });

export const PaperQuestionSchema = z.object({
  number:       z.number().int().positive(),
  type:         z.enum(PAPER_QUESTION_TYPES),
  marks:        z.number().positive(),
  wordLimit:    PaperWordLimitSchema.optional(),
  unitRef:      z.string().optional(),
  chapterId:    z.string().optional(),
  subPartCount: z.number().int().positive().optional(),
  generated:    z.unknown().nullable().default(null),
  error:        z.string().optional(),
});

export const PaperSectionSchema = z.object({
  label:          z.string().min(1),
  title:          z.string().optional(),
  instructions:   z.string().optional(),
  totalToAttempt: z.number().int().positive().optional(),
  totalMarks:     z.number().positive(),
  questions:      z.array(PaperQuestionSchema).min(1),
});

export const PaperStructureSchema = z.object({
  title:               z.string().min(1),
  totalMarks:          z.number().positive(),
  duration:            z.string().optional(),
  generalInstructions: z.array(z.string()).default([]),
  sections:            z.array(PaperSectionSchema).min(1),
});

export type PaperQuestion  = z.infer<typeof PaperQuestionSchema>;
export type PaperSection   = z.infer<typeof PaperSectionSchema>;
export type PaperStructure = z.infer<typeof PaperStructureSchema>;
