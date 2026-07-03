/**
 * Real-API sanity check — run manually: npx tsx src/ai/__tests__/sanity.ts
 * Saves raw fixtures, validates them through the full pipeline.
 * Not a vitest test — no mock, real Groq calls.
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { realGenerateFn, parseAiJsonArray } from '../generator.js';
import { validateQuestionBlock } from '../../validation/index.js';

const SOURCE = `
Photosynthesis is the process by which green plants and some other organisms use sunlight
to synthesize nutrients from carbon dioxide and water. The process generates oxygen as a
byproduct. Chlorophyll, the pigment in plant cells, absorbs the light energy required for
this process. Photosynthesis occurs in two stages: the light-dependent reactions (which take
place in the thylakoid membranes) and the Calvin cycle (which takes place in the stroma of
the chloroplast). The overall equation for photosynthesis is:
6CO2 + 6H2O + light energy → C6H12O6 + 6O2
Plants that use this process are called autotrophs because they produce their own food.
`;

async function runCheck(type: Parameters<typeof realGenerateFn>[1], count: number) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Type: ${type}  Count: ${count}`);
  console.log('─'.repeat(60));

  const raw = await realGenerateFn(SOURCE, type, count, 2);
  const rawStr = JSON.stringify(raw, null, 2);

  writeFileSync(`src/ai/__tests__/fixture_${type}.json`, rawStr, 'utf8');
  console.log(`[fixture saved] fixture_${type}.json`);
  console.log('[raw output]', rawStr.slice(0, 400), raw.length > 1 ? '...' : '');

  const { valid, invalidCount } = validateQuestionBlock(type, raw);
  console.log(`[validation] valid=${valid.length}  invalid=${invalidCount}`);

  if (invalidCount > 0) {
    console.error('  ⚠  Some questions failed schema validation — check prompts.ts');
  } else {
    console.log('  ✓  All questions passed Zod validation');
  }
  return { valid, invalidCount };
}

(async () => {
  try {
    await runCheck('fillInBlanks',   2);
    await runCheck('multipleChoice', 2);
    await runCheck('trueFalse',      2);
    console.log('\n✓ Sanity check complete.\n');
  } catch (err) {
    console.error('Sanity check failed:', err);
    process.exit(1);
  }
})();
