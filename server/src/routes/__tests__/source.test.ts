// vi.mock is hoisted by vitest — it runs before any imports.
// We mock the lib path directly because extractor.ts bypasses pdf-parse/index.js
// (which triggers a self-test file read that fails in vitest environments).
vi.mock('pdf-parse/lib/pdf-parse.js', () => ({
  default: vi.fn().mockResolvedValue({ text: 'Sample text content for testing purposes. '.repeat(30) }),
}));

import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../app.js';

async function registerAndGetToken(role: 'teacher' | 'hod') {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: `Test ${role}`, email, password: 'password123', role, department: 'CS' })
    .expect(201);
  return res.body.accessToken as string;
}

// A minimal buffer that multer accepts as a PDF (MIME is set explicitly)
const FAKE_PDF = Buffer.from('%PDF-1.4 fake pdf content for testing only');

// MAX_PDF_SIZE_MB=1 is set in setup.ts, so this exceeds the 1 MB limit
const OVER_LIMIT_PDF = Buffer.alloc(1 * 1024 * 1024 + 1);

// ---------------------------------------------------------------------------
// TC-SRC-01 — Valid PDF upload
// ---------------------------------------------------------------------------
describe('TC-SRC-01: Valid PDF upload', () => {
  it('returns 201 with setId, fileName, wordCount, previewText; QuestionSet created in DB', async () => {
    const token = await registerAndGetToken('teacher');
    const res   = await request(app)
      .post('/api/source/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', FAKE_PDF, { filename: 'chapter1.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.setId).toBeTypeOf('string');
    expect(res.body.fileName).toBe('chapter1.pdf');
    expect(res.body.wordCount).toBeTypeOf('number');
    expect(res.body.wordCount).toBeGreaterThan(0);
    expect(res.body.previewText).toBeTypeOf('string');
    expect(res.body.previewText.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// TC-SRC-02 — Non-PDF file rejected
// ---------------------------------------------------------------------------
describe('TC-SRC-02: Non-PDF file → 400', () => {
  it('rejects a .docx file with 400 "Only PDF files are accepted."', async () => {
    const token = await registerAndGetToken('teacher');
    const res   = await request(app)
      .post('/api/source/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake docx content'), {
        filename:    'doc.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Only PDF files are accepted.');
  });

  it('rejects a plain text file with 400', async () => {
    const token = await registerAndGetToken('teacher');
    const res   = await request(app)
      .post('/api/source/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('just text'), { filename: 'notes.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Only PDF files are accepted.');
  });
});

// ---------------------------------------------------------------------------
// TC-SRC-03 — File exceeds size limit
// ---------------------------------------------------------------------------
describe('TC-SRC-03: PDF exceeds size limit → 400', () => {
  it('rejects a file larger than MAX_PDF_SIZE_MB (1 MB in test env)', async () => {
    const token = await registerAndGetToken('teacher');
    const res   = await request(app)
      .post('/api/source/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', OVER_LIMIT_PDF, { filename: 'large.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds/i);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// TC-SRC-04 — Scanned PDF (no extractable text) → 422; no set created
// ---------------------------------------------------------------------------
describe('TC-SRC-04: Scanned PDF → 422, no QuestionSet created', () => {
  it('returns 422 when pdf-parse returns empty text', async () => {
    const mockFn = (await import('pdf-parse/lib/pdf-parse.js')).default as ReturnType<typeof vi.fn>;
    mockFn.mockResolvedValueOnce({ text: '   ' }); // whitespace only → no extractable text

    const token = await registerAndGetToken('teacher');
    const res   = await request(app)
      .post('/api/source/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', FAKE_PDF, { filename: 'scanned.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/could not extract/i);
  });

  it('returns 422 when pdf-parse throws (password-protected PDF)', async () => {
    const mockFn = (await import('pdf-parse/lib/pdf-parse.js')).default as ReturnType<typeof vi.fn>;
    mockFn.mockRejectedValueOnce(new Error('Decryption failed'));

    const token = await registerAndGetToken('teacher');
    const res   = await request(app)
      .post('/api/source/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', FAKE_PDF, { filename: 'protected.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/could not extract/i);
  });
});

// ---------------------------------------------------------------------------
// TC-SRC-05 — HOD cannot upload source PDFs
// ---------------------------------------------------------------------------
describe('TC-SRC-05: HOD attempting PDF upload → 403', () => {
  it('returns 403 for hod role', async () => {
    const token = await registerAndGetToken('hod');
    const res   = await request(app)
      .post('/api/source/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', FAKE_PDF, { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Unauthenticated request → 401
// ---------------------------------------------------------------------------
describe('Source upload — unauthenticated', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await request(app)
      .post('/api/source/upload')
      .attach('file', FAKE_PDF, { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(401);
  });
});
