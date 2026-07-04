import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock groq-sdk before importing schemeParser
vi.mock('groq-sdk', () => {
  const create = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create } },
    })),
    __mockCreate: create,
  };
});

// Helper to get the mocked `create` fn without importing groq-sdk directly
async function getMockCreate() {
  const mod = await import('groq-sdk');
  return (mod as any).__mockCreate as ReturnType<typeof vi.fn>;
}

function makeGroqResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

describe('parseScheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── TC-SCH-PARSE-01 ────────────────────────────────────────────────────
  it('returns 3 TypeConfig entries for a clean scheme with 3 clear sections', async () => {
    const mockCreate = await getMockCreate();
    mockCreate.mockResolvedValueOnce(makeGroqResponse(JSON.stringify([
      { type: 'fillInBlanks',   count: 10, marksPerQuestion: 1 },
      { type: 'multipleChoice', count: 5,  marksPerQuestion: 2 },
      { type: 'trueFalse',      count: 8,  marksPerQuestion: 1 },
    ])));

    const { parseScheme } = await import('../schemeParser.js');
    const result = await parseScheme('Section A: Fill in the blanks...');

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 'fillInBlanks',   count: 10, marksPerQuestion: 1 });
    expect(result[1]).toEqual({ type: 'multipleChoice', count: 5,  marksPerQuestion: 2 });
    expect(result[2]).toEqual({ type: 'trueFalse',      count: 8,  marksPerQuestion: 1 });
  });

  // ─── TC-SCH-PARSE-02a ───────────────────────────────────────────────────
  it('filters out entries with type names not in VALID_TYPES', async () => {
    const mockCreate = await getMockCreate();
    mockCreate.mockResolvedValueOnce(makeGroqResponse(JSON.stringify([
      { type: 'multipleChoice', count: 5, marksPerQuestion: 2 },
      { type: 'essay',          count: 3, marksPerQuestion: 5 }, // invalid type
    ])));

    const { parseScheme } = await import('../schemeParser.js');
    const result = await parseScheme('some scheme text');

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('multipleChoice');
  });

  // ─── TC-SCH-PARSE-02b ───────────────────────────────────────────────────
  it('throws SCHEME_PARSE_FAILED when the only entry has an invalid type name', async () => {
    const mockCreate = await getMockCreate();
    mockCreate.mockResolvedValueOnce(makeGroqResponse(JSON.stringify([
      { type: 'essay', count: 3, marksPerQuestion: 5 },
    ])));

    const { parseScheme } = await import('../schemeParser.js');
    await expect(parseScheme('some scheme text')).rejects.toThrow('SCHEME_PARSE_FAILED');
  });

  // ─── TC-SCH-PARSE-03 ────────────────────────────────────────────────────
  it('throws SCHEME_PARSE_FAILED when model returns malformed JSON', async () => {
    const mockCreate = await getMockCreate();
    mockCreate.mockResolvedValueOnce(makeGroqResponse('this is not json at all'));

    const { parseScheme } = await import('../schemeParser.js');
    await expect(parseScheme('some scheme text')).rejects.toThrow('SCHEME_PARSE_FAILED');
  });

  // ─── TC-SCH-PARSE-04 ────────────────────────────────────────────────────
  it('throws SCHEME_PARSE_FAILED when count is a string "10" instead of a number', async () => {
    const mockCreate = await getMockCreate();
    mockCreate.mockResolvedValueOnce(makeGroqResponse(JSON.stringify([
      { type: 'fillInBlanks', count: '10', marksPerQuestion: 1 }, // count is string
    ])));

    const { parseScheme } = await import('../schemeParser.js');
    await expect(parseScheme('some scheme text')).rejects.toThrow('SCHEME_PARSE_FAILED');
  });
});
