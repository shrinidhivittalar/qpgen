/**
 * One-shot manual test for mapSkill via the generateTypeViaSlots path
 * (the same path the UI's Generate button hits).
 * Run with:  npx tsx src/test/testMapSkill.ts
 * from the server/ directory.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../db/connect.js';
import TextbookChapter from '../models/TextbookChapter.js';
import { generateTypeViaSlots } from '../ai/generator.js';
import { createLimiter } from '../lib/concurrency.js';

const MAP_ITEMS = [
  'Tropic of Cancer',
  'Western Ghats',
  'Deccan Plateau',
  'Bay of Bengal',
  'Ganga River',
  'Thar Desert',
  'Himalayas',
];

async function main() {
  await connectDB();

  const chapter = await TextbookChapter.findOne({
    sourceText: { $exists: true, $ne: '' },
  }).lean();

  if (!chapter) {
    console.error('No chapters found. Upload a textbook chapter first.');
    process.exit(1);
  }

  console.log(`\nUsing chapter: "${chapter.title}" (${chapter.sourceText.length} chars)\n`);

  const chapterInput = {
    id:                chapter._id.toString(),
    name:              chapter.title,
    weightPercent:     chapter.weightPercent,
    sourceText:        chapter.sourceText,
    highValueSnippets: chapter.highValueSnippets,
  };

  console.log('Calling generateTypeViaSlots (mapSkill, count=2, 5 marks each)...\n');

  const result = await generateTypeViaSlots(
    'mapSkill',
    2,                          // count — tests batching
    5,                          // marksPerQuestion
    [chapterInput],
    undefined,                  // difficulty
    chapter.teacherId.toString(),
    'formal-board-exam',
    undefined,                  // bankId
    createLimiter(2),
    0,                          // typeIndex
    MAP_ITEMS,
  );

  console.log(`Requested: ${result.requested}, Received: ${result.received}\n`);

  if (result.questions.length === 0) {
    console.log('Generation FAILED — no questions returned.');
  } else {
    result.questions.forEach((q, i) => {
      console.log(`Question ${i + 1}:`);
      console.log(JSON.stringify(q, null, 2));
      console.log();
    });
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
