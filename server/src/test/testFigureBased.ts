/**
 * One-shot manual test for figureBased paper generation.
 * Requires GROQ_MOCK_FIGURE=true in server/.env (real vision call skipped).
 * Run with:  npx tsx src/test/testFigureBased.ts
 * from the server/ directory.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../db/connect.js';
import TextbookChapter from '../models/TextbookChapter.js';
import { generatePaper } from '../ai/paperGenerator.js';
import { buildQuestionPaperDoc } from '../ai/wordExporter.js';
import { writeFileSync } from 'fs';
import type { PaperStructure } from '../types/paperStructure.js';

// Minimal 10×10 white PNG — enough to exercise readImageDimensions().
// Generated via:  python3 -c "import base64,zlib,struct; ..."
// Width=10 height=10, bit depth=8, color type=2 (RGB).
const MINI_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAFklEQVQI12P8' +
  'z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

async function main() {
  if (process.env.GROQ_MOCK_FIGURE !== 'true') {
    console.warn(
      'GROQ_MOCK_FIGURE is not set to "true". The test will make a real vision API call.',
    );
  }

  await connectDB();

  const chapter = await TextbookChapter.findOne({
    sourceText: { $exists: true, $ne: '' },
  }).lean();

  if (!chapter) {
    console.error('No chapters found. Upload a textbook chapter first.');
    process.exit(1);
  }

  console.log(`\nUsing chapter: "${chapter.title}"`);
  console.log(`GROQ_MOCK_FIGURE: ${process.env.GROQ_MOCK_FIGURE ?? 'not set'}\n`);

  // Test both subTypes: 2-mark → mcq, 4-mark → shortAnswer
  const structure: PaperStructure = {
    title: 'Figure Based Test Paper',
    totalMarks: 6,
    generalInstructions: [],
    sections: [
      {
        label: 'Section A',
        totalMarks: 6,
        questions: [
          { number: 1, type: 'figureBased', marks: 2, generated: null },
          { number: 2, type: 'figureBased', marks: 4, generated: null },
        ],
      },
    ],
  };

  const figureImages = [
    { base64: MINI_PNG_BASE64, mimeType: 'image/png' as const, filename: 'test-figure.png' },
  ];

  console.log('Calling generatePaper (2 figureBased questions: 2-mark MCQ + 4-mark shortAnswer)...\n');

  const result = await generatePaper(
    structure,
    [
      {
        id:                chapter._id.toString(),
        name:              chapter.title,
        weightPercent:     chapter.weightPercent,
        sourceText:        chapter.sourceText,
        highValueSnippets: chapter.highValueSnippets,
      },
    ],
    { teacherId: chapter.teacherId.toString(), tone: 'formal-board-exam' },
    figureImages,
  );

  console.log(
    `Result: ${result.filledSlots}/${result.totalSlots} slots filled, ${result.failedSlots} failed\n`,
  );

  const questions = result.structure.sections[0]?.questions ?? [];
  questions.forEach((q, i) => {
    if (q.generated) {
      console.log(`Q${i + 1} (${q.marks}m):`);
      console.log(JSON.stringify(q.generated, null, 2));
    } else {
      console.log(`Q${i + 1} FAILED:`, q.error);
    }
  });

  // Also exercise the Word exporter so we confirm image embedding doesn't crash.
  if (result.filledSlots > 0) {
    console.log('\nBuilding Word document...');
    try {
      const buffer  = await buildQuestionPaperDoc(result.structure);
      const outPath = 'src/test/figureBased_test_output.docx';
      writeFileSync(outPath, buffer);
      console.log(`Word export OK — ${buffer.byteLength} bytes → ${outPath}`);
    } catch (err) {
      console.error('Word export FAILED:', err instanceof Error ? err.message : String(err));
    }
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
