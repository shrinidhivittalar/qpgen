// vi.mock is hoisted — must appear before any imports.
vi.mock('groq-sdk', () => {
  const create = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({ chat: { completions: { create } } })),
    __mockCreate: create,
  };
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { heuristicDifficulty, classifyDifficulty } from '../difficultyClassifier.js';
import { validateQuestionBlock } from '../../validation/index.js';

async function getMockCreate(): Promise<ReturnType<typeof vi.fn>> {
  const mod = await import('groq-sdk');
  return (mod as any).__mockCreate as ReturnType<typeof vi.fn>;
}

const makeFillQ = (text: string) => ({
  id: 1, marks: 2,
  explanation: 'Explanation.',
  question: { hide_text: false, text, read_text: false, image: '' },
  correctAnswer: 'answer',
  alternatives: [],
});

const groqResp = (word: string) => ({
  choices: [{ message: { content: word } }],
  usage: { total_tokens: 10 },
});

// ────────────────────────────────────────────────────────────────────────────
// heuristicDifficulty — pure function, no mocks needed
// ────────────────────────────────────────────────────────────────────────────

describe('heuristicDifficulty', () => {
  it('classifies "define" phrasing as easy with high confidence', () => {
    const result = heuristicDifficulty('Define the term photosynthesis.', 'fillInBlanks', {});
    expect(result.level).toBe('easy');
    expect(result.confidence).toBe('high');
  });

  it('classifies "which of the following" phrasing as easy (broad easy-stem pattern)', () => {
    const result = heuristicDifficulty(
      'Which of the following best describes the role of chlorophyll?',
      'multipleChoice', {},
    );
    expect(result.level).toBe('easy');
    expect(result.confidence).toBe('high');
  });

  it('classifies caseStudy with 4 subQuestions as hard with high confidence', () => {
    const result = heuristicDifficulty(
      'Analyze the following scenario.',
      'caseStudy',
      { subQuestions: [1, 2, 3, 4] },
    );
    expect(result.level).toBe('hard');
    expect(result.confidence).toBe('high');
  });

  it('returns low confidence for a short question with no clear verb signal', () => {
    const result = heuristicDifficulty('The output varies.', 'fillInBlanks', {});
    expect(result.level).toBeNull();
    expect(result.confidence).toBe('low');
  });

  it('classifies multi-step calc (3+ numbers + formula pattern) as hard', () => {
    const result = heuristicDifficulty(
      'Given precision = 0.8, recall = 0.6, and total samples = 200, compute the ratio of true positives.',
      'fillInBlanks', {},
    );
    expect(result.level).toBe('hard');
    expect(result.confidence).toBe('high');
  });

  it('classifies 3+ unit-labelled values + calculate keyword as hard (broadened formula detection)', () => {
    const result = heuristicDifficulty(
      'A plant absorbs light at 520nm with intensity 100 lux for 30 min. Calculate the expected oxygen output.',
      'multipleChoice', {},
    );
    expect(result.level).toBe('hard');
    expect(result.confidence).toBe('high');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// classifyDifficulty — heuristic fast path + LLM fallback
// ────────────────────────────────────────────────────────────────────────────

describe('classifyDifficulty', () => {
  let create: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    create = await getMockCreate();
    create.mockReset();
  });

  it('"define" phrasing returns easy WITHOUT invoking the LLM (heuristic high confidence)', async () => {
    const level = await classifyDifficulty('Define the term photosynthesis.', 'fillInBlanks', {});
    expect(level).toBe('easy');
    expect(create).not.toHaveBeenCalled();
  });

  it('ambiguous question invokes the LLM exactly once and honors its response', async () => {
    create.mockResolvedValueOnce(groqResp('moderate'));

    const level = await classifyDifficulty('The output varies.', 'fillInBlanks', {});

    expect(level).toBe('moderate');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('LLM returning an unrecognised word defaults to moderate', async () => {
    create.mockResolvedValueOnce(groqResp('complex'));

    const level = await classifyDifficulty('The output varies.', 'fillInBlanks', {});
    expect(level).toBe('moderate');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// validateQuestionBlock — difficulty-filter integration
// ────────────────────────────────────────────────────────────────────────────

describe('validateQuestionBlock difficulty filtering', () => {
  let create: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    create = await getMockCreate();
    create.mockReset();
  });

  it('"define" question rejected when requestedDifficulty is hard (heuristic, no LLM call)', async () => {
    const q = makeFillQ('Define the term photosynthesis.');

    const { valid, invalidCount } = await validateQuestionBlock('fillInBlanks', [q], [], 'hard');

    expect(valid).toHaveLength(0);
    expect(invalidCount).toBe(1);
    expect(create).not.toHaveBeenCalled(); // heuristic caught it
  });

  it('requestedDifficulty omitted → no difficulty check, all schema-valid questions pass (regression)', async () => {
    const questions = Array.from({ length: 3 }, () => makeFillQ('What is photosynthesis?'));

    const { valid, invalidCount } = await validateQuestionBlock('fillInBlanks', questions);

    expect(valid).toHaveLength(3);
    expect(invalidCount).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });
});
