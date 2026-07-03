import { Router, Request, Response } from 'express';
import multer from 'multer';

import { extractText } from '../ai/extractor.js';
import { QuestionSet } from '../models/QuestionSet.js';
import { User } from '../models/User.js';
import { logger } from '../lib/logger.js';

const router = Router();

const MAX_PDF_BYTES = (parseInt(process.env.MAX_PDF_SIZE_MB ?? '10', 10)) * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(), // buffer only — never touches disk (ADR-009)
  limits:  { fileSize: MAX_PDF_BYTES },
  fileFilter(_req, file, cb) {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('NON_PDF'));
    }
  },
});

// Multer error handler — converts multer errors to clean JSON before Express
// sees them, so the catch-all 500 handler is never hit for expected cases.
function handleMulterUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return resolve();
      reject(err);
    });
  });
}

// POST /api/source/upload
// Auth + role middleware are applied at mount point in app.ts
router.post('/upload', async (req: Request, res: Response) => {
  try {
    await handleMulterUpload(req, res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'NON_PDF' || msg.includes('MIME')) {
      res.status(400).json({ error: 'Only PDF files are accepted.' });
      return;
    }
    if (msg.includes('File too large') || (err as any)?.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File size exceeds 10 MB limit.' });
      return;
    }
    res.status(400).json({ error: 'File upload failed.' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded.' });
    return;
  }

  let sourceText: string;
  try {
    sourceText = await extractText(req.file.buffer);
  } catch {
    // SRC-04: extraction failure — do NOT create a QuestionSet
    res.status(422).json({ error: 'Could not extract text from this PDF. Try a text-based PDF.' });
    return;
  }

  // Fetch the teacher's department from the User doc
  const teacher = await User.findById((req as any).userId).lean();
  if (!teacher) {
    res.status(401).json({ error: 'User not found.' });
    return;
  }

  const set = await QuestionSet.create({
    teacherId:  (req as any).userId,
    department: teacher.department ?? '',
    fileName:   req.file.originalname,
    sourceText,
    status:     'draft',
  });

  logger.info('source_uploaded', {
    requestId: (req as any).requestId,
    userId:    (req as any).userId,
    setId:     set._id.toString(),
    fileName:  req.file.originalname,
    wordCount: sourceText.split(/\s+/).length,
  });

  const wordCount   = sourceText.split(/\s+/).filter(Boolean).length;
  const previewText = sourceText.slice(0, 200);

  res.status(201).json({
    setId:       set._id.toString(),
    fileName:    req.file.originalname,
    wordCount,
    previewText,
  });
});

export default router;
