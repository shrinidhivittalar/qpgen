import { QuestionType } from '../validation/schemaMap.js';
import { allocateByWeight } from '../lib/allocation.js';

export type Slot = {
  chapterId:        string | null;
  chapterName:      string;
  type:             QuestionType;
  difficulty:       'easy' | 'moderate' | 'hard';
  marksPerQuestion: number;
  sourceExcerpt:    string; // '' sentinel means no chapter configured —
                             // caller should use the full QuestionSet sourceText
};

type Difficulty = 'easy' | 'moderate' | 'hard';

// Collapses the 4-tier difficulty table (1/2/3/5-mark) into 3 tiers —
// the 5-mark "hard + cross-chapter" tier is folded into 'hard' for now;
// true cross-chapter synthesis is a Phase 2 refinement.
const DIFFICULTY_DISTRIBUTION: Record<Difficulty, number> = {
  easy:     0.35,
  moderate: 0.40,
  hard:     0.25,
};

export type ChapterInput = {
  id:                string;
  name:              string;
  weightPercent:     number;
  sourceText:        string;
  highValueSnippets: string[];
};

export async function allocateSlots(
  type:              QuestionType,
  count:             number,
  marksPerQuestion:  number,
  chapters:          ChapterInput[],
  explicitDifficulty?: Difficulty,
): Promise<Slot[]> {
  if (chapters.length === 0) {
    return allocateWithoutChapters(type, count, marksPerQuestion, explicitDifficulty);
  }

  const weights          = chapters.map(c => c.weightPercent);
  const perChapterCounts = allocateByWeight(count, weights);

  const slots: Slot[] = [];
  for (let i = 0; i < chapters.length; i++) {
    const chapter      = chapters[i];
    const chapterCount = perChapterCounts[i];
    if (chapterCount === 0) continue;

    const difficulties: Difficulty[] = explicitDifficulty
      ? Array<Difficulty>(chapterCount).fill(explicitDifficulty)
      : expandDistribution(chapterCount, DIFFICULTY_DISTRIBUTION);

    for (let j = 0; j < chapterCount; j++) {
      slots.push({
        chapterId:        chapter.id,
        chapterName:      chapter.name,
        type,
        difficulty:       difficulties[j],
        marksPerQuestion,
        sourceExcerpt:    pickExcerpt(chapter.sourceText, chapter.highValueSnippets, j),
      });
    }
  }

  return shuffle(slots);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function expandDistribution(count: number, dist: Record<Difficulty, number>): Difficulty[] {
  const counts = allocateByWeight(count, [dist.easy, dist.moderate, dist.hard]);
  return [
    ...Array<Difficulty>(counts[0]).fill('easy'),
    ...Array<Difficulty>(counts[1]).fill('moderate'),
    ...Array<Difficulty>(counts[2]).fill('hard'),
  ];
}

export function pickExcerpt(
  fullText:          string,
  highValueSnippets: string[],
  slotIndex:         number,
): string {
  if (highValueSnippets.length > 0) {
    const snippet = highValueSnippets[slotIndex % highValueSnippets.length];
    const idx     = fullText.indexOf(snippet);
    if (idx !== -1) {
      const start = Math.max(0, idx - 500);
      const end   = Math.min(fullText.length, idx + snippet.length + 500);
      return fullText.slice(start, end);
    }
    // Snippet text not found verbatim in fullText (e.g. teacher pasted it
    // with slight edits) — fall through to the rotating window below
  }

  const windowSize = 2000;
  const maxStart   = Math.max(1, fullText.length - windowSize);
  const start      = (slotIndex * 700) % maxStart;
  return fullText.slice(start, start + windowSize);
}

function allocateWithoutChapters(
  type:              QuestionType,
  count:             number,
  marksPerQuestion:  number,
  explicitDifficulty?: Difficulty,
): Promise<Slot[]> {
  const difficulties: Difficulty[] = explicitDifficulty
    ? Array<Difficulty>(count).fill(explicitDifficulty)
    : expandDistribution(count, DIFFICULTY_DISTRIBUTION);

  const slots: Slot[] = Array.from({ length: count }, (_, j) => ({
    chapterId:        null,
    chapterName:      '',
    type,
    difficulty:       difficulties[j],
    marksPerQuestion,
    sourceExcerpt:    '', // sentinel — caller uses full QuestionSet sourceText
  }));

  return Promise.resolve(slots);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
