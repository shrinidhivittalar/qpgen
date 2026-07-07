vi.mock('groq-sdk', () => {
  const create = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({ chat: { completions: { create } } })),
    __mockCreate: create,
  };
});

import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../app.js';
import { QuestionSet } from '../../models/QuestionSet.js';
import { GenerationRun } from '../../models/GenerationRun.js';
import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getMockCreate(): Promise<ReturnType<typeof vi.fn>> {
  const mod = await import('groq-sdk');
  return (mod as any).__mockCreate as ReturnType<typeof vi.fn>;
}

async function registerAndLogin(role = 'teacher') {
  const email = `${role}-edit-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  const res   = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Edit Tester', email, password: 'password123', role, department: 'CS' })
    .expect(201);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

function makeFIBQuestion(id: number, marks = 1): object {
  return {
    id, marks, explanation: `Explanation ${id}.`,
    question:      { hide_text: false, text: `Question ${id}?`, read_text: false, image: '' },
    correctAnswer: `Answer ${id}`,
    alternatives:  [],
  };
}

function makeTFQuestion(id: number, marks = 1): object {
  return {
    id, marks, explanation: `Explanation ${id}.`,
    question:      { hide_text: false, text: `True/False ${id}?`, read_text: false, image: '' },
    correctAnswer: true,
  };
}

function groqResp(questions: unknown[]) {
  return { choices: [{ message: { content: JSON.stringify(questions) } }], usage: { total_tokens: 100 } };
}

async function createSetWithQuestions(teacherId: string): Promise<{ setId: string; questionId: number }> {
  const q1 = makeFIBQuestion(1);
  const q2 = makeFIBQuestion(2);
  const set = await QuestionSet.create({
    teacherId,
    department:   'CS',
    fileName:     'source.pdf',
    sourceText:   'Source text about algorithms, data structures, and software engineering principles.',
    status:       'draft',
    typeConfig:   [{ type: 'fillInBlanks', count: 2, marksPerQuestion: 1, difficulty: 'moderate' }],
    questionBlocks: [{
      questionType: 'fillInBlanks',
      totalMarks:   2,
      status:       'success',
      questions:    [q1, q2],
    }],
  });
  return { setId: set._id.toString(), questionId: 1 };
}

let teacherToken: string;
let teacherId:    string;
let create:       ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const t = await registerAndLogin();
  teacherToken = t.token;
  teacherId    = t.userId;
  create       = await getMockCreate();
  create.mockReset();
  create.mockImplementation(() =>
    Promise.resolve(groqResp([makeFIBQuestion(1), makeFIBQuestion(2), makeFIBQuestion(3)])),
  );
});

// ---------------------------------------------------------------------------
// PATCH /api/sets/:id/questions/:questionId
// ---------------------------------------------------------------------------

describe('TC-EDIT-01: Successful inline question edit', () => {
  it('updates the question and returns 200 with the saved question', async () => {
    const { setId, questionId } = await createSetWithQuestions(teacherId);

    const updatedQ = {
      question:      { hide_text: false, text: 'Updated question text?', read_text: false, image: '' },
      correctAnswer: 'Updated answer',
      alternatives:  ['alt1'],
      explanation:   'Updated explanation.',
    };

    const res = await request(app)
      .patch(`/api/sets/${setId}/questions/${questionId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send(updatedQ);

    expect(res.status).toBe(200);
    expect(res.body.question.question.text).toBe('Updated question text?');
    expect(res.body.question.correctAnswer).toBe('Updated answer');
    expect(res.body.question.explanation).toBe('Updated explanation.');
    // id and marks must be preserved
    expect(res.body.question.id).toBe(questionId);
    expect(res.body.question.marks).toBe(1);
  });

  it('persists the change in the database', async () => {
    const { setId, questionId } = await createSetWithQuestions(teacherId);

    await request(app)
      .patch(`/api/sets/${setId}/questions/${questionId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        question:      { hide_text: false, text: 'DB-persisted text?', read_text: false, image: '' },
        correctAnswer: 'DB answer',
        alternatives:  [],
        explanation:   'DB explanation.',
      });

    const saved = await QuestionSet.findById(setId).lean();
    const savedQ = (saved?.questionBlocks as any[])[0].questions.find((q: any) => q.id === questionId);
    expect(savedQ.question.text).toBe('DB-persisted text?');
    expect(savedQ.correctAnswer).toBe('DB answer');
  });
});

describe('TC-EDIT-02: Schema validation blocks invalid edits', () => {
  it('returns 422 when explanation is empty', async () => {
    const { setId, questionId } = await createSetWithQuestions(teacherId);

    const res = await request(app)
      .patch(`/api/sets/${setId}/questions/${questionId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        question:      { hide_text: false, text: 'Q?', read_text: false, image: '' },
        correctAnswer: 'A',
        alternatives:  [],
        explanation:   '',  // invalid — must be non-empty
      });

    expect(res.status).toBe(422);
  });
});

describe('TC-EDIT-03: Ownership check on edit', () => {
  it("returns 403 when teacher B tries to edit teacher A's question", async () => {
    const { setId, questionId } = await createSetWithQuestions(teacherId);
    const teacherB = await registerAndLogin();

    const res = await request(app)
      .patch(`/api/sets/${setId}/questions/${questionId}`)
      .set('Authorization', `Bearer ${teacherB.token}`)
      .send({
        question:      { hide_text: false, text: 'Q?', read_text: false, image: '' },
        correctAnswer: 'A',
        alternatives:  [],
        explanation:   'E.',
      });

    expect(res.status).toBe(403);
  });
});

describe('TC-EDIT-04: Non-existent question returns 404', () => {
  it('returns 404 for a questionId not in any block', async () => {
    const { setId } = await createSetWithQuestions(teacherId);

    const res = await request(app)
      .patch(`/api/sets/${setId}/questions/999`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        question:      { hide_text: false, text: 'Q?', read_text: false, image: '' },
        correctAnswer: 'A',
        alternatives:  [],
        explanation:   'E.',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 400 for a malformed (non-numeric) questionId', async () => {
    const { setId } = await createSetWithQuestions(teacherId);

    const res = await request(app)
      .patch(`/api/sets/${setId}/questions/not-a-number`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ question: { text: 'Q?' }, correctAnswer: 'A', explanation: 'E.' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid question id/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/sets/:id/regenerate
// ---------------------------------------------------------------------------

describe('TC-REGEN-01: Successful type regeneration', () => {
  it('returns 200 with success:true, updated blocks, and globally unique IDs', async () => {
    const { setId } = await createSetWithQuestions(teacherId);

    const res = await request(app)
      .post(`/api/sets/${setId}/regenerate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ type: 'fillInBlanks' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.regeneratedType).toBe('fillInBlanks');
    expect(res.body.questionBlocks).toHaveLength(1);

    const allIds = res.body.questionBlocks.flatMap((b: any) => b.questions.map((q: any) => q.id));
    expect(new Set(allIds).size).toBe(allIds.length); // all unique
    expect(Math.min(...allIds)).toBe(1);
  });

  it('persists the new block in the database', async () => {
    const { setId } = await createSetWithQuestions(teacherId);

    await request(app)
      .post(`/api/sets/${setId}/regenerate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ type: 'fillInBlanks' });

    const saved = await QuestionSet.findById(setId).lean();
    expect(saved?.questionBlocks).toHaveLength(1);
    const block = (saved?.questionBlocks as any[])[0];
    expect(block.questionType).toBe('fillInBlanks');
  });
});

describe('TC-REGEN-02: Regenerate type not in original set → 404', () => {
  it('returns 404 when the type was not part of the original generation', async () => {
    const { setId } = await createSetWithQuestions(teacherId);

    const res = await request(app)
      .post(`/api/sets/${setId}/regenerate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ type: 'trueFalse' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not part of the original generation/i);
  });
});

describe('TC-REGEN-03: Ownership check on regeneration', () => {
  it("returns 403 when teacher B tries to regenerate teacher A's set", async () => {
    const { setId } = await createSetWithQuestions(teacherId);
    const teacherB = await registerAndLogin();

    const res = await request(app)
      .post(`/api/sets/${setId}/regenerate`)
      .set('Authorization', `Bearer ${teacherB.token}`)
      .send({ type: 'fillInBlanks' });

    expect(res.status).toBe(403);
  });
});

describe('TC-REGEN-04: Budget exceeded blocks regeneration', () => {
  it('returns 429 when the daily token budget is exhausted', async () => {
    const { setId } = await createSetWithQuestions(teacherId);

    await GenerationRun.create({
      setId:           new mongoose.Types.ObjectId(setId),
      userId:          new mongoose.Types.ObjectId(teacherId),
      role:            'teacher',
      typesRequested:  ['fillInBlanks'],
      countsRequested: { fillInBlanks: 1 },
      tokensUsed:      100_001,
      durationMs:      100,
    });

    const res = await request(app)
      .post(`/api/sets/${setId}/regenerate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ type: 'fillInBlanks' });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/budget exceeded/i);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('TC-REGEN-05: IDs reassigned globally after regeneration', () => {
  it('IDs start at 1 and are globally unique across all blocks after regen', async () => {
    // Set with two types already generated
    const q1 = makeFIBQuestion(1);
    const q2 = makeFIBQuestion(2);
    const tf1 = makeTFQuestion(3);
    const set = await QuestionSet.create({
      teacherId, department: 'CS', fileName: 'src.pdf',
      sourceText: 'Source text about algorithms, data structures, and software engineering principles.',
      status: 'draft',
      typeConfig: [
        { type: 'fillInBlanks', count: 2, marksPerQuestion: 1, difficulty: 'moderate' },
        { type: 'trueFalse',    count: 1, marksPerQuestion: 1, difficulty: 'moderate' },
      ],
      questionBlocks: [
        { questionType: 'fillInBlanks', totalMarks: 2, status: 'success', questions: [q1, q2] },
        { questionType: 'trueFalse',    totalMarks: 1, status: 'success', questions: [tf1] },
      ],
    });

    // Mock: fillInBlanks regeneration returns 2 questions; trueFalse stays
    create.mockImplementation(() =>
      Promise.resolve(groqResp([makeFIBQuestion(99), makeFIBQuestion(99)])), // IDs don't matter — server reassigns
    );

    const res = await request(app)
      .post(`/api/sets/${set._id}/regenerate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ type: 'fillInBlanks' });

    expect(res.status).toBe(200);
    const allIds = res.body.questionBlocks.flatMap((b: any) => b.questions.map((q: any) => q.id));
    expect(allIds).toHaveLength(3); // 2 FIB + 1 TF
    expect(new Set(allIds).size).toBe(3);
    expect(Math.min(...allIds)).toBe(1);
    expect(Math.max(...allIds)).toBe(3);
  });
});
