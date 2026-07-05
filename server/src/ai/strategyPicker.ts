import { QuestionType } from '../validation/schemaMap.js';
import { getHistoricalCandidate } from './historicalRetrieval.js';

// Probability that a given slot draws from the historical bank rather than
// generating fresh. Kept as a named constant so it can be made per-subject
// or per-exam-type in a later phase without hunting for magic numbers.
const HISTORICAL_DRAW_PROBABILITY = 0.30;

export type Strategy = 'fresh' | 'rephrase' | 'variant' | 'reuse';

export async function pickStrategy(
  teacherId: string,
  chapterId: string | null,
  type:      QuestionType,
): Promise<{ strategy: Strategy; baseQuestion: string | null }> {
  // 70% path — no DB query at all
  if (Math.random() >= HISTORICAL_DRAW_PROBABILITY) {
    return { strategy: 'fresh', baseQuestion: null };
  }

  const candidate = await getHistoricalCandidate(teacherId, chapterId, type);
  if (!candidate) {
    return { strategy: 'fresh', baseQuestion: null };
  }

  const currentYear = new Date().getFullYear();
  // null sourceYear → treat as age 0 (recent bucket) so we never reuse a
  // question whose vintage we can't verify.  This is the safe default
  // described in the historical-retrieval design doc.
  const age = candidate.sourceYear != null ? currentYear - candidate.sourceYear : 0;

  let strategy: Strategy;
  if (age <= 2) {
    strategy = 'rephrase';
  } else if (age <= 5) {
    strategy = Math.random() < 0.5 ? 'rephrase' : 'variant';
  } else {
    const r = Math.random();
    strategy = r < 0.34 ? 'rephrase' : r < 0.67 ? 'variant' : 'reuse';
  }

  return { strategy, baseQuestion: candidate.rawText };
}
