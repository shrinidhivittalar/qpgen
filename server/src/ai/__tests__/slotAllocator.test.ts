import { describe, it, expect } from 'vitest';
import { allocateSlots, pickExcerpt, ChapterInput } from '../slotAllocator.js';

const TYPE = 'multipleChoice' as const;

function makeChapter(
  id: string,
  name: string,
  weightPercent: number,
  sourceText = 'A'.repeat(4000),
  highValueSnippets: string[] = [],
): ChapterInput {
  return { id, name, weightPercent, sourceText, highValueSnippets };
}

// ── allocateSlots ─────────────────────────────────────────────────────────────

describe('allocateSlots — chapter weight distribution', () => {
  it('distributes 10 slots across [50,30,20] weights summing to exactly 10 and roughly [5,3,2]', async () => {
    const chapters = [
      makeChapter('c1', 'Ch1', 50),
      makeChapter('c2', 'Ch2', 30),
      makeChapter('c3', 'Ch3', 20),
    ];
    const slots = await allocateSlots(TYPE, 10, 1, chapters);

    expect(slots).toHaveLength(10);

    const c1Count = slots.filter(s => s.chapterId === 'c1').length;
    const c2Count = slots.filter(s => s.chapterId === 'c2').length;
    const c3Count = slots.filter(s => s.chapterId === 'c3').length;
    expect(c1Count + c2Count + c3Count).toBe(10);
    expect(c1Count).toBe(5);
    expect(c2Count).toBe(3);
    expect(c3Count).toBe(2);
  });
});

describe('allocateSlots — explicit difficulty override', () => {
  it('sets every slot to difficulty "hard" when explicitDifficulty is passed', async () => {
    const chapters = [makeChapter('c1', 'Ch1', 60), makeChapter('c2', 'Ch2', 40)];
    const slots = await allocateSlots(TYPE, 8, 2, chapters, 'hard');

    expect(slots).toHaveLength(8);
    expect(slots.every(s => s.difficulty === 'hard')).toBe(true);
  });
});

describe('allocateSlots — difficulty distribution without override', () => {
  it('produces all three difficulty levels across 20 slots (35/40/25 split)', async () => {
    // Single chapter, count=20 → deterministic split: easy=7, moderate=8, hard=5
    const chapters = [makeChapter('c1', 'Ch1', 100)];
    const slots = await allocateSlots(TYPE, 20, 1, chapters);

    expect(slots).toHaveLength(20);

    const easy     = slots.filter(s => s.difficulty === 'easy').length;
    const moderate = slots.filter(s => s.difficulty === 'moderate').length;
    const hard     = slots.filter(s => s.difficulty === 'hard').length;
    expect(easy + moderate + hard).toBe(20);
    expect(easy).toBeGreaterThan(0);
    expect(moderate).toBeGreaterThan(0);
    expect(hard).toBeGreaterThan(0);
    // Verify the exact counts expected from allocateByWeight(20, [0.35, 0.40, 0.25])
    expect(easy).toBe(7);
    expect(moderate).toBe(8);
    expect(hard).toBe(5);
  });
});

describe('allocateSlots — empty chapters fallback', () => {
  it('falls back to allocateWithoutChapters and still returns the requested slot count', async () => {
    const slots = await allocateSlots(TYPE, 6, 1, []);

    expect(slots).toHaveLength(6);
    expect(slots.every(s => s.chapterId === null)).toBe(true);
  });
});

describe('allocateSlots — zero-weight chapter', () => {
  it('contributes 0 slots for a chapter with weightPercent=0 without throwing', async () => {
    const chapters = [
      makeChapter('c1', 'Ch1', 70),
      makeChapter('c2', 'Ch2', 0),  // zero weight
      makeChapter('c3', 'Ch3', 30),
    ];
    const slots = await allocateSlots(TYPE, 10, 1, chapters);

    expect(slots).toHaveLength(10);
    expect(slots.filter(s => s.chapterId === 'c2').length).toBe(0);
  });
});

// ── pickExcerpt ───────────────────────────────────────────────────────────────

describe('pickExcerpt', () => {
  it('returns a window containing the snippet when highValueSnippets are present', () => {
    const snippet    = 'the photoelectric effect';
    const fullText   = 'A'.repeat(600) + snippet + 'B'.repeat(600);
    const result     = pickExcerpt(fullText, [snippet], 0);

    expect(result).toContain(snippet);
  });

  it('returns a valid non-empty window when no snippets are provided', () => {
    const fullText = 'X'.repeat(5000);
    const result   = pickExcerpt(fullText, [], 0);

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(2000);
  });

  it('rotates the window offset with slotIndex when no snippets provided', () => {
    // Non-periodic: first 700 chars are 'a', remainder are 'b'.
    // slotIndex=0 → slice(0, 2000) starts with 'a'; slotIndex=1 → slice(700, 2700) starts with 'b'.
    const fullText = 'a'.repeat(700) + 'b'.repeat(3300);
    const result0  = pickExcerpt(fullText, [], 0);
    const result1  = pickExcerpt(fullText, [], 1);

    expect(result0).not.toBe(result1);
    expect(result0.startsWith('a')).toBe(true);
    expect(result1.startsWith('b')).toBe(true);
  });

  it('cycles through snippets using slotIndex modulo', () => {
    const s1      = 'first snippet';
    const s2      = 'second snippet';
    const fullText = 'padding ' + s1 + ' middle ' + s2 + ' end';
    const r0      = pickExcerpt(fullText, [s1, s2], 0);
    const r2      = pickExcerpt(fullText, [s1, s2], 2);

    // Both slotIndex 0 and 2 should hit the same snippet (s1, index 0 mod 2)
    expect(r0).toContain(s1);
    expect(r2).toContain(s1);
  });
});
