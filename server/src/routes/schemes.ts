import { Router, Request, Response } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';

import { extractText, extractTextFromDocx } from '../ai/extractor.js';
import { parseScheme } from '../ai/schemeParser.js';
import Scheme from '../models/Scheme.js';
import { logger } from '../lib/logger.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

const MAX_SCHEME_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIMES: Record<string, 'pdf' | 'docx'> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_SCHEME_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIMES[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE'));
    }
  },
});

function handleMulterUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return resolve();
      reject(err);
    });
  });
}

async function runUpload(req: Request, res: Response): Promise<
  { rawText: string; fileType: 'pdf' | 'docx' } | null
> {
  try {
    await handleMulterUpload(req, res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'INVALID_FILE_TYPE') {
      res.status(400).json({ error: 'Only PDF and Word (.docx) files are accepted.' });
      return null;
    }
    if ((err as any)?.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File size exceeds 5 MB limit.' });
      return null;
    }
    res.status(400).json({ error: 'File upload failed.' });
    return null;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded.' });
    return null;
  }

  const fileType = ALLOWED_MIMES[req.file.mimetype];
  let rawText: string;
  try {
    rawText = fileType === 'docx'
      ? await extractTextFromDocx(req.file.buffer)
      : await extractText(req.file.buffer);
  } catch {
    res.status(422).json({ error: 'Could not extract text from this file.' });
    return null;
  }

  return { rawText, fileType };
}

// POST /api/schemes/upload
router.post('/upload', requireRole('teacher'), async (req: Request, res: Response) => {
  const extracted = await runUpload(req, res);
  if (!extracted) return;
  const { rawText, fileType } = extracted;

  const { name, subject, standard, examType } = req.body as Record<string, string>;
  if (!name || !subject || !standard) {
    res.status(400).json({ error: 'name, subject, and standard are required.' });
    return;
  }

  let parsedConfig: Awaited<ReturnType<typeof parseScheme>>;
  try {
    parsedConfig = await parseScheme(rawText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'SCHEME_PARSE_INVALID') {
      res.status(422).json({ error: 'Could not parse a valid question configuration from this scheme.' });
    } else {
      res.status(503).json({ error: 'AI service unavailable. Please try again.' });
    }
    return;
  }

  const scheme = await Scheme.create({
    teacherId:    (req as any).userId,
    name:         name.trim().slice(0, 100),
    subject:      subject.trim(),
    standard:     standard.trim(),
    examType:     examType?.trim() ?? null,
    rawText,
    parsedConfig,
    fileType,
  });

  logger.info('scheme_uploaded', {
    requestId: (req as any).requestId,
    userId:    (req as any).userId,
    schemeId:  scheme._id.toString(),
    fileType,
    typesFound: parsedConfig.length,
  });

  res.status(201).json({
    schemeId:       scheme._id.toString(),
    name:           scheme.name,
    subject:        scheme.subject,
    standard:       scheme.standard,
    examType:       scheme.examType,
    fileType:       scheme.fileType,
    parsedConfig,
    previewSections: parsedConfig,
  });
});

// GET /api/schemes
router.get('/', requireRole('teacher'), async (req: Request, res: Response) => {
  const schemes = await Scheme
    .find({ teacherId: (req as any).userId })
    .select('-rawText')
    .sort({ updatedAt: -1 })
    .lean();

  res.json(
    schemes.map(s => ({
      schemeId:    s._id.toString(),
      name:        s.name,
      subject:     s.subject,
      standard:    s.standard,
      examType:    s.examType,
      fileType:    s.fileType,
      parsedConfig: s.parsedConfig,
      updatedAt:   s.updatedAt,
    })),
  );
});

// GET /api/schemes/:id
router.get('/:id', requireRole('teacher'), async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: 'Scheme not found.' });
    return;
  }

  const scheme = await Scheme.findById(req.params.id).lean();
  if (!scheme) {
    res.status(404).json({ error: 'Scheme not found.' });
    return;
  }
  if (scheme.teacherId.toString() !== (req as any).userId) {
    res.status(403).json({ error: "You don't have permission to view this scheme." });
    return;
  }

  res.json({
    schemeId:     scheme._id.toString(),
    name:         scheme.name,
    subject:      scheme.subject,
    standard:     scheme.standard,
    examType:     scheme.examType,
    fileType:     scheme.fileType,
    parsedConfig: scheme.parsedConfig,
    rawText:      scheme.rawText,
    updatedAt:    scheme.updatedAt,
  });
});

// PATCH /api/schemes/:id/replace
router.patch('/:id/replace', requireRole('teacher'), async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: 'Scheme not found.' });
    return;
  }

  const existing = await Scheme.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Scheme not found.' });
    return;
  }
  if (existing.teacherId.toString() !== (req as any).userId) {
    res.status(403).json({ error: "You don't have permission to update this scheme." });
    return;
  }

  const extracted = await runUpload(req, res);
  if (!extracted) return;
  const { rawText, fileType } = extracted;

  let parsedConfig: Awaited<ReturnType<typeof parseScheme>>;
  try {
    parsedConfig = await parseScheme(rawText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'SCHEME_PARSE_INVALID') {
      res.status(422).json({ error: 'Could not parse a valid question configuration from this scheme.' });
    } else {
      res.status(503).json({ error: 'AI service unavailable. Please try again.' });
    }
    return;
  }

  // Update optional metadata fields if provided
  const { name, subject, standard, examType } = req.body as Record<string, string>;
  if (name) existing.name = name.trim().slice(0, 100);
  if (subject) existing.subject = subject.trim();
  if (standard) existing.standard = standard.trim();
  if (examType !== undefined) existing.examType = examType?.trim() ?? null;

  existing.rawText      = rawText;
  existing.parsedConfig = parsedConfig as any;
  existing.fileType     = fileType;
  await existing.save();

  res.json({
    schemeId:     existing._id.toString(),
    name:         existing.name,
    subject:      existing.subject,
    standard:     existing.standard,
    examType:     existing.examType,
    fileType:     existing.fileType,
    parsedConfig,
    updatedAt:    existing.updatedAt,
  });
});

// DELETE /api/schemes/:id
router.delete('/:id', requireRole('teacher'), async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: 'Scheme not found.' });
    return;
  }

  const scheme = await Scheme.findById(req.params.id);
  if (!scheme) {
    res.status(404).json({ error: 'Scheme not found.' });
    return;
  }
  if (scheme.teacherId.toString() !== (req as any).userId) {
    res.status(403).json({ error: "You don't have permission to delete this scheme." });
    return;
  }

  await scheme.deleteOne();
  res.json({ success: true });
});

export default router;
