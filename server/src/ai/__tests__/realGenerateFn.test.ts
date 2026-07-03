import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the groq-sdk module before importing generator so the Groq constructor
// receives the mock, not the real SDK.
vi.mock('groq-sdk', () => {
  const create = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create } },
    })),
    __mockCreate: create,
  };
});

// Import after mock is registered
import { realGenerateFn, parseAiJsonArray } from '../generator.js';

// Helper to reach the mocked `create` function
async function getMockCreate() {
  const mod = await import('groq-sdk');
  return (mod as any).__mockCreate as ReturnType<typeof vi.fn>;
}

const makeGroqResponse = (content: string) => ({
  choices: [{ message: { content } }],
  usage: { total_tokens: 100 },
});

// ────────────────────────────────────────────────────────────────────────────
// parseAiJsonArray (pure function — no mock needed)
// ────────────────────────────────────────────────────────────────────────────
describe('parseAiJsonArray', () => {
  it('parses a clean JSON array string', () => {
    const result = parseAiJsonArray('[{"id":1},{"id":2}]');
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('strips ```json fences before parsing', () => {
    const fenced = '```json\n[{"id":1}]\n```';
    expect(parseAiJsonArray(fenced)).toEqual([{ id: 1 }]);
  });

  it('strips plain ``` fences before parsing', () => {
    const fenced = '```\n[{"id":1}]\n```';
    expect(parseAiJsonArray(fenced)).toEqual([{ id: 1 }]);
  });

  it('returns [] for garbage non-JSON text — does not throw', () => {
    expect(parseAiJsonArray('Here are your questions: blah blah')).toEqual([]);
  });

  it('returns [] when parsed value is not an array', () => {
    expect(parseAiJsonArray('{"id":1}')).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// realGenerateFn (mocked Groq client)
// ────────────────────────────────────────────────────────────────────────────
describe('realGenerateFn', () => {
  beforeEach(async () => {
    const create = await getMockCreate();
    create.mockReset();
  });

  it('returns parsed array on a successful response with clean JSON', async () => {
    const create = await getMockCreate();
    const payload = [{ id: 1, marks: 2, explanation: 'E', question: { hide_text: false, text: 'Q?', read_text: false, image: '' }, correctAnswer: 'ans', alternatives: [] }];
    create.mockResolvedValueOnce(makeGroqResponse(JSON.stringify(payload)));

    const result = await realGenerateFn('source', 'fillInBlanks', 1, 2);
    expect(result).toEqual(payload);
  });

  it('returns parsed array when model wraps response in ```json fences', async () => {
    const create = await getMockCreate();
    const payload = [{ id: 1 }];
    create.mockResolvedValueOnce(makeGroqResponse('```json\n' + JSON.stringify(payload) + '\n```'));

    const result = await realGenerateFn('source', 'fillInBlanks', 1, 2);
    expect(result).toEqual(payload);
  });

  it('returns [] when model returns garbage non-JSON — does not throw', async () => {
    const create = await getMockCreate();
    create.mockResolvedValueOnce(makeGroqResponse('Sorry, I cannot help with that.'));

    const result = await realGenerateFn('source', 'trueFalse', 1, 1);
    expect(result).toEqual([]);
  });

  it('propagates a Groq client throw up to the caller (withRetry / runTypeLoop catch)', async () => {
    vi.useFakeTimers();
    const create = await getMockCreate();
    const networkErr = Object.assign(new Error('network failure'), { status: 503 });
    create.mockRejectedValue(networkErr);

    const promise = realGenerateFn('source', 'fillInBlanks', 1, 2);
    const assertion = expect(promise).rejects.toThrow('network failure');
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });
});
