import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Must be set before importing any module that reads this env var
process.env.JWT_ACCESS_SECRET = 'test-secret-for-unit-tests-only-minimum-32-chars!';

import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { signAccessToken } from '../../auth/tokens.js';

// --- Helpers ---

function makeReq(authHeader?: string, extra: Record<string, unknown> = {}): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    ...extra,
  } as unknown as Request;
}

function makeRes() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response & typeof res;
}

// --- requireAuth ---

describe('requireAuth', () => {
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn();
  });

  it('missing Authorization header → 401', () => {
    const req = makeReq();
    const res = makeRes();
    requireAuth(req, res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('malformed header (no "Bearer ") → 401', () => {
    const req = makeReq('Token abc123');
    const res = makeRes();
    requireAuth(req, res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('expired token → 401', () => {
    const expired = jwt.sign(
      { id: 'u1', role: 'teacher' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: -10 }, // already 10 seconds in the past
    );
    const req = makeReq(`Bearer ${expired}`);
    const res = makeRes();
    requireAuth(req, res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('tampered signature → 401 (EC-ROLE-06 — must fail closed)', () => {
    const valid = signAccessToken('u1', 'teacher');
    const [header, payload, sig] = valid.split('.');
    // Flip the last character of the signature
    const tampered = sig.at(-1) === 'a' ? sig.slice(0, -1) + 'b' : sig.slice(0, -1) + 'a';
    const req = makeReq(`Bearer ${header}.${payload}.${tampered}`);
    const res = makeRes();
    requireAuth(req, res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('valid token → calls next(), sets req.userId and req.role from payload', () => {
    const token = signAccessToken('user-abc', 'hod');
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    requireAuth(req, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect((req as Request & { userId: string; role: string }).userId).toBe('user-abc');
    expect((req as Request & { userId: string; role: string }).role).toBe('hod');
  });
});

// --- requireRole ---

describe('requireRole', () => {
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn();
  });

  it("role='teacher', allowed=['teacher'] → calls next()", () => {
    const req = { role: 'teacher' } as unknown as Request;
    const res = makeRes();
    requireRole('teacher')(req, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("role='hod', allowed=['teacher'] → 403 with exact error message", () => {
    const req = { role: 'hod' } as unknown as Request;
    const res = makeRes();
    requireRole('teacher')(req, res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "You don't have permission to do this." });
    expect(next).not.toHaveBeenCalled();
  });

  it("role='principal', allowed=['hod','principal'] → calls next() (multi-role allow-list)", () => {
    const req = { role: 'principal' } as unknown as Request;
    const res = makeRes();
    requireRole('hod', 'principal')(req, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
