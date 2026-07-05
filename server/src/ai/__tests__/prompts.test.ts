import { vi, describe, it, expect, afterEach } from 'vitest';
import { buildPrompt } from '../prompts.js';
import * as exemplarRetrieval from '../exemplarRetrieval.js';

vi.mock('../exemplarRetrieval.js', () => ({
  getExemplars: vi.fn(),
}));

afterEach(() => {
  vi.mocked(exemplarRetrieval.getExemplars).mockReset();
});

const BASE_ARGS = [
  'multipleChoice',           // type
  'Some source content.',     // sourceText
  3,                          // count
  'teacher-1',                // teacherId
  'moderate' as const,        // difficulty
  'neutral' as const,         // tone
] as const;

describe('buildPrompt — strategy=reuse', () => {
  it('includes the base question verbatim and the "changing nothing" instruction', async () => {
    vi.mocked(exemplarRetrieval.getExemplars).mockResolvedValue([]);
    const baseQ = 'State and explain Newton\'s second law of motion.';

    const { system } = await buildPrompt(
      ...BASE_ARGS,
      undefined, // bankId
      undefined, // subjectHint
      undefined, // dedupeHint
      'reuse',
      baseQ,
    );

    expect(system).toContain(baseQ);
    expect(system).toContain('changing nothing about its content, wording, or answer');
  });
});

describe('buildPrompt — strategy=fresh', () => {
  it('adds no strategy instruction block (clean no-op, backward-compatible)', async () => {
    vi.mocked(exemplarRetrieval.getExemplars).mockResolvedValue([]);

    const { system } = await buildPrompt(...BASE_ARGS);

    // None of the strategy-specific phrases should appear
    expect(system).not.toContain('appeared in a previous exam');
    expect(system).not.toContain('from a different angle');
    expect(system).not.toContain('changing nothing');
  });
});

describe('buildPrompt — strategy=rephrase', () => {
  it('includes the base question and the "rephrase" instruction', async () => {
    vi.mocked(exemplarRetrieval.getExemplars).mockResolvedValue([]);
    const baseQ = 'Define osmosis.';

    const { system } = await buildPrompt(
      ...BASE_ARGS,
      undefined, undefined, undefined,
      'rephrase',
      baseQ,
    );

    expect(system).toContain(baseQ);
    expect(system).toContain('appeared in a previous exam');
    expect(system).toContain('Do NOT change what concept is being tested');
  });
});

describe('buildPrompt — strategy=variant', () => {
  it('includes the base question and the "different angle" instruction', async () => {
    vi.mocked(exemplarRetrieval.getExemplars).mockResolvedValue([]);
    const baseQ = 'Explain the process of mitosis.';

    const { system } = await buildPrompt(
      ...BASE_ARGS,
      undefined, undefined, undefined,
      'variant',
      baseQ,
    );

    expect(system).toContain(baseQ);
    expect(system).toContain('from a different angle');
  });
});

describe('buildPrompt — chapterName', () => {
  it('prepends chapter context to the user message when chapterName is provided', async () => {
    vi.mocked(exemplarRetrieval.getExemplars).mockResolvedValue([]);

    const { user } = await buildPrompt(
      ...BASE_ARGS,
      undefined, undefined, undefined,
      'fresh', null,
      'Chapter 3: Laws of Motion',
    );

    expect(user).toContain('This question should be based on material from the chapter "Chapter 3: Laws of Motion".');
    expect(user).toContain('Source material:');
    // Chapter line comes before the source material
    expect(user.indexOf('Chapter 3')).toBeLessThan(user.indexOf('Source material:'));
  });

  it('omits chapter prefix when chapterName is empty (no-chapters backward-compat path)', async () => {
    vi.mocked(exemplarRetrieval.getExemplars).mockResolvedValue([]);

    const { user } = await buildPrompt(
      ...BASE_ARGS,
      undefined, undefined, undefined,
      'fresh', null, '',
    );

    expect(user).not.toContain('This question should be based on material from');
    expect(user.startsWith('Source material:')).toBe(true);
  });
});
