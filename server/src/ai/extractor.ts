// Import from lib/ directly to bypass pdf-parse's index.js debug self-test
// (index.js reads a test PDF file when !module.parent, which breaks in vitest).
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';

export async function extractText(buffer: Buffer): Promise<string> {
  let result: { text: string };
  try {
    result = await pdfParse(buffer);
  } catch (err) {
    console.error('[extractor] pdf-parse threw:', (err as Error).message);
    throw new Error('EXTRACTION_FAILED');
  }
  const text = result.text.trim();
  if (text.length === 0) {
    console.error('[extractor] no text extracted — likely a scanned/image PDF');
    throw new Error('EXTRACTION_FAILED');
  }
  return text;
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
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
