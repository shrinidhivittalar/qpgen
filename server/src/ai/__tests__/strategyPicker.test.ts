import { vi, describe, it, expect, afterEach } from 'vitest';
import { pickStrategy } from '../strategyPicker.js';
import { getHistoricalCandidate } from '../historicalRetrieval.js';

vi.mock('../historicalRetrieval.js', () => ({
  getHistoricalCandidate: vi.fn(),
}));

const THIS_YEAR = new Date().getFullYear();

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getHistoricalCandidate).mockReset();
});

// ── Spec test 1 ───────────────────────────────────────────────────────────────

describe('70% fresh path', () => {
  it('Math.random >= 0.30 → fresh immediately, getHistoricalCandidate never called', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const result = await pickStrategy('t1', 'c1', 'multipleChoice');

    expect(result).toEqual({ strategy: 'fresh', baseQuestion: null });
    expect(getHistoricalCandidate).not.toHaveBeenCalled();
  });
});

// ── Spec test 2 ───────────────────────────────────────────────────────────────

describe('age 0 (this year) → rephrase', () => {
  it('sourceYear = this year → strategy is always rephrase, baseQuestion populated', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // < 0.30 → draw from history
    vi.mocked(getHistoricalCandidate).mockResolvedValue({
      rawText: 'What is photosynthesis?',
      sourceYear: THIS_YEAR,
    });

    const result = await pickStrategy('t1', 'c1', 'fillInBlanks');

    expect(result.strategy).toBe('rephrase');
    expect(result.baseQuestion).toBe('What is photosynthesis?');
  });
});

// ── Spec test 3 ───────────────────────────────────────────────────────────────

describe('age 4 years → rephrase or variant only', () => {
  it('never returns reuse or fresh for a 4-year-old question', async () => {
    vi.mocked(getHistoricalCandidate).mockResolvedValue({
      rawText: 'Explain Newton\'s third law.',
      sourceYear: THIS_YEAR - 4,
    });

    // Per iteration: call 1 = probability check (0.1 < 0.30 → draw history),
    // call 2 = strategy selection.  0.1 → rephrase (< 0.5), 0.8 → variant (≥ 0.5).
    // Crucially, 0.8 would give 'reuse' in the age>5 branch — here it gives 'variant'.
    const mockValues = [0.1, 0.1, 0.1, 0.8];
    let idx = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => mockValues[idx++ % mockValues.length]);

    const strategies = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const { strategy } = await pickStrategy('t1', 'c1', 'multipleChoice');
      strategies.add(strategy);
      expect(strategy).not.toBe('reuse');
      expect(strategy).not.toBe('fresh');
    }
    expect(strategies.has('rephrase')).toBe(true);
    expect(strategies.has('variant')).toBe(true);
  });
});

// ── Spec test 4 ───────────────────────────────────────────────────────────────

describe('age 8 years → all 3 strategies reachable', () => {
  it('rephrase, variant and reuse all appear across 100 sequential calls', async () => {
    vi.mocked(getHistoricalCandidate).mockResolvedValue({
      rawText: 'State Ohm\'s law.',
      sourceYear: THIS_YEAR - 8,
    });

    // Sequential calls → calls interleave cleanly as [probability, strategy] pairs.
    // mockValues cycle [0.1, 0.2, 0.1, 0.5, 0.1, 0.8]:
    //   probability=0.1 (<0.30, draw history); strategy: 0.2→rephrase, 0.5→variant, 0.8→reuse
    const mockValues = [0.1, 0.2, 0.1, 0.5, 0.1, 0.8];
    let idx = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => mockValues[idx++ % mockValues.length]);

    const strategies = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { strategy } = await pickStrategy('t1', 'c1', 'trueFalse');
      strategies.add(strategy);
    }

    expect(strategies.has('rephrase')).toBe(true);
    expect(strategies.has('variant')).toBe(true);
    expect(strategies.has('reuse')).toBe(true);
  });
});

// ── Spec test 5 ───────────────────────────────────────────────────────────────

describe('sourceYear = null → treated as age 0 → rephrase only', () => {
  it('null sourceYear always yields rephrase (safe default: unknown vintage = recent bucket)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // always draw from history; age=0 branch has no second call
    vi.mocked(getHistoricalCandidate).mockResolvedValue({
      rawText: 'Define osmosis.',
      sourceYear: null,
    });

    for (let i = 0; i < 10; i++) {
      const { strategy } = await pickStrategy('t1', null, 'fillInBlanks');
      expect(strategy).toBe('rephrase');
    }
  });
});

// ── Spec test 6 ───────────────────────────────────────────────────────────────

describe('no bank coverage → clean fresh fallback', () => {
  it('below 0.30 draw but getHistoricalCandidate returns null → falls back to fresh', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // trigger history draw
    vi.mocked(getHistoricalCandidate).mockResolvedValue(null);

    const result = await pickStrategy('t1', 'c1', 'trueFalse');

    expect(result).toEqual({ strategy: 'fresh', baseQuestion: null });
  });
});
