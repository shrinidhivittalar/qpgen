import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';
import { spawn } from 'child_process';
import path from 'path';

const SCRIPT = path.resolve(process.cwd(), 'extract_question_images.py');

const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);

// ponytail: scanned PDF → OCR deferred; only images get OCR.
export async function extractText(buffer: Buffer, mimetype = 'application/pdf'): Promise<string> {
  if (IMAGE_TYPES.has(mimetype)) {
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng');
    const t = text.trim();
    if (t.length === 0) throw new Error('EXTRACTION_FAILED');
    return t;
  }

  let result: { text: string };
  try {
    result = await pdfParse(buffer);
  } catch {
    throw new Error('EXTRACTION_FAILED');
  }
  const text = result.text.trim();
  if (text.length < 100) throw new Error('SCANNED_PDF');
  return text;
}

export interface ExtractedImage {
  pngBuffer: Buffer;
  width:     number;
  height:    number;
}

export interface PageData {
  pageIndex: number;
  text:      string; // PyMuPDF text — used for matching questions to pages
  images:    ExtractedImage[];
}

// Calls extract_question_images.py via stdin/stdout.
// Returns per-page text + cropped embedded images (already extracted by PyMuPDF, not full page renders).
export function extractPdfPages(buffer: Buffer): Promise<PageData[]> {
  return new Promise((resolve, reject) => {
    const py = spawn('python', [SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] });

    let out = '';
    let err = '';
    py.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    py.stderr.on('data', (d: Buffer) => { err += d.toString(); });

    py.on('close', (code: number) => {
      if (code !== 0) {
        reject(new Error(`extract_question_images.py exited ${code}: ${err}`));
        return;
      }
      try {
        const pages = JSON.parse(out) as Array<{
          pageIndex: number;
          text: string;
          images: Array<{ b64: string; width: number; height: number }>;
        }>;
        resolve(pages.map(p => ({
          pageIndex: p.pageIndex,
          text:      p.text,
          images:    p.images.map(img => ({
            pngBuffer: Buffer.from(img.b64, 'base64'),
            width:     img.width,
            height:    img.height,
          })),
        })));
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${e}`));
      }
    });

    py.stdin.write(buffer);
    py.stdin.end();
  });
}

// Returns the page whose PyMuPDF text best matches the question (word overlap on first 15 words).
export function findQuestionPage(questionText: string, pages: PageData[]): PageData | null {
  const words = questionText.toLowerCase().split(/\s+/).slice(0, 15);
  let bestScore = 2;
  let bestPage: PageData | null = null;
  for (const page of pages) {
    const pt    = page.text.toLowerCase();
    const score = words.filter(w => w.length > 3 && pt.includes(w)).length;
    if (score > bestScore) { bestScore = score; bestPage = page; }
  }
  return bestPage;
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  let result;
  try {
    result = await mammoth.extractRawText({ buffer });
  } catch {
    throw new Error('EXTRACTION_FAILED');
  }
  const text = result.value.trim();
  if (text.length === 0) throw new Error('EXTRACTION_FAILED');
  return text;
}
