import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { requireRole } from '../middleware/requireRole.js';
import { QuestionSet } from '../models/QuestionSet.js';
import { GenerationRun } from '../models/GenerationRun.js';
import Scheme from '../models/Scheme.js';
import { generateSet, makeTrackedGenerateFn, TypeConfig } from '../ai/generator.js';
import { checkAndReserveBudget } from '../services/tokenBudget.js';
import { logger } from '../lib/logger.js';
import { DifficultyLevel, ToneOption } from '../validation/schemas/typeConfig.js';

const router = Router();

const VALID_TYPES = [
  'fillInBlanks', 'multipleChoice', 'multiSelect', 'matchTheFollowing',
  'reordering', 'sorting', 'trueFalse',
] as const;

const TypeConfigItemSchema = z.object({
  type:             z.string(),
  count:            z.number().int().min(0),
  marksPerQuestion: z.number().positive(),
  difficulty:       DifficultyLevel.optional(),
});

const GenerateBodySchema = z.object({
  typeConfig:        z.array(TypeConfigItemSchema).min(1),
  schemeId:          z.string().optional(),
  bankId:            z.string().optional(),
  difficultyDefault: DifficultyLevel.optional(),
  tone:              ToneOption.optional(),
});

// POST /api/sets/:id/generate
router.post('/:id/generate', requireRole('teacher'), async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;

  // 1. Load set
  const set = await QuestionSet.findById(req.params.id);
  if (!set) {
    res.status(404).json({ error: 'Question set not found.' });
    return;
  }

  // Ownership check — TC-GEN-09
  if (set.teacherId.toString() !== userId) {
    res.status(403).json({ error: "You don't have permission to generate for this set." });
    return;
  }

  // 2. Validate request body
  const bodyResult = GenerateBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: bodyResult.error.issues[0]?.message ?? 'Invalid request body.' });
    return;
  }

  // Validate type names explicitly to produce the required error message
  for (const tc of bodyResult.data.typeConfig) {
    if (!(VALID_TYPES as readonly string[]).includes(tc.type)) {
      res.status(400).json({ error: `Invalid question type: ${tc.type}` });
      return;
    }
  }

  // Filter zero-count entries, then check if anything remains (EC-GEN-02)
  const { difficultyDefault, tone, bankId } = bodyResult.data;

  // Resolve each type's effective difficulty before generation
  const effectiveTypeConfig = bodyResult.data.typeConfig.map(tc => ({
    ...tc,
    difficulty: tc.difficulty ?? difficultyDefault ?? 'moderate',
  }));

  const activeTypeConfig = effectiveTypeConfig.filter(tc => tc.count > 0) as TypeConfig[];
  if (activeTypeConfig.length === 0) {
    res.status(400).json({ error: 'Select at least one question type with a count greater than 0.' });
    return;
  }

  // 3. Pre-run budget check (EC-GEN-13)
  const hasBudget = await checkAndReserveBudget(userId);
  if (!hasBudget) {
    res.status(429).json({ error: 'Daily token budget exceeded.' });
    return;
  }

  // 4. Generate
  const { generateFn, getTokensUsed } = makeTrackedGenerateFn();
  const startTime = Date.now();
  let blocks: Awaited<ReturnType<typeof generateSet>>['blocks'];
  let errors: Awaited<ReturnType<typeof generateSet>>['errors'];

  try {
    ({ blocks, errors } = await generateSet(set.sourceText, activeTypeConfig, generateFn, {
      tone,
      bankId,
      teacherId:   userId,
      subjectHint: set.department,
    }));
  } catch {
    // generateSet uses allSettled internally and should not throw under normal
    // conditions; if it does (e.g. Groq client init failure), treat as 503.
    res.status(503).json({ error: 'AI service unavailable. Please try again.' });
    return;
  }

  const durationMs  = Date.now() - startTime;
  const tokensUsed  = getTokensUsed();

  // 5. Persist results
  // Resolve optional schemeId — silently ignore if invalid or not owned (SCH-12)
  const { schemeId } = bodyResult.data;
  if (schemeId) {
    try {
      const scheme = await Scheme.findById(schemeId).lean();
      if (scheme && scheme.teacherId.toString() === userId) {
        set.schemeId = scheme._id as any;
      }
    } catch {
      // invalid ObjectId or DB error — ignore, schemeId stays null
    }
  }

  // Audit metadata — silently stored regardless of bankId validity (Stage 3 will validate)
  if (difficultyDefault) set.difficultyDefault = difficultyDefault as any;
  if (tone)              set.tone              = tone as any;
  if (bankId)            set.bankId            = bankId as any;

  set.questionBlocks   = blocks as any;
  set.generationErrors = errors as any;
  set.typeConfig       = activeTypeConfig as any;
  set.status           = 'draft';
  await set.save();

  // 6. Audit log — created regardless of partial failure (EC-DATA-01)
  await GenerationRun.create({
    setId:           set._id,
    userId,
    role:            'teacher',
    typesRequested:  activeTypeConfig.map(t => t.type),
    typesSucceeded:  blocks.map(b => b.questionType),
    typesFailed:     errors.map(e => e.type),
    countsRequested: Object.fromEntries(activeTypeConfig.map(t => [t.type, t.count])),
    countsGenerated: Object.fromEntries(blocks.map(b => [b.questionType, b.questions.length])),
    tokensUsed,
    durationMs,
    requestId: (req as any).requestId,
  });

  logger.info('generation_complete', {
    requestId:      (req as any).requestId,
    userId,
    role:           'teacher',
    setId:          set._id.toString(),
    durationMs,
    typesRequested: activeTypeConfig.map(t => t.type),
    typesSucceeded: blocks.map(b => b.questionType),
    typesFailed:    errors.map(e => e.type),
    tokensUsed,
  });

  res.status(200).json({
    questionBlocks:   blocks,
    generationErrors: errors,
    totalGenerated:   blocks.reduce((s, b) => s + b.questions.length, 0),
  });
});

export default router;
