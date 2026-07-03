import request from 'supertest';
import { describe, it, expect } from 'vitest';
import app from '../../app.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEACHER = {
  name: 'Alice Teacher',
  email: 'alice@example.com',
  password: 'password123',
  role: 'teacher',
  department: 'Computer Science',
};

const PRINCIPAL = {
  name: 'Bob Principal',
  email: 'bob@example.com',
  password: 'password123',
  role: 'principal',
  // no department — allowed for principal
};

/** Register a user and return the agent (carries the refresh-token cookie). */
async function registerAgent(data = TEACHER) {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send(data).expect(201);
  return agent;
}

/** Return the raw Set-Cookie header string from a response. */
function getCookie(res: request.Response): string {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  return cookies?.[0] ?? '';
}

// ---------------------------------------------------------------------------
// TC-AUTH-01: register (teacher) → 201 + user object + accessToken + cookie
// ---------------------------------------------------------------------------
describe('TC-AUTH-01: POST /api/auth/register (valid, teacher)', () => {
  it('returns 201 with user + accessToken and sets refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(TEACHER)
      .expect(201);

    expect(res.body.user.email).toBe('alice@example.com');
    expect(res.body.user.role).toBe('teacher');
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user.hashedPassword).toBeUndefined();
    expect(getCookie(res)).toMatch(/refreshToken=/);
  });

  it('also works for principal (no department required)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(PRINCIPAL)
      .expect(201);

    expect(res.body.user.role).toBe('principal');
  });
});

// ---------------------------------------------------------------------------
// TC-AUTH-02: duplicate email → 409
// ---------------------------------------------------------------------------
describe('TC-AUTH-02: duplicate email → 409', () => {
  it('returns 409 on second registration with same email', async () => {
    await request(app).post('/api/auth/register').send(TEACHER).expect(201);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...TEACHER, name: 'Other' })
      .expect(409);

    expect(res.body.error).toBe('Email already registered');
  });
});

// ---------------------------------------------------------------------------
// TC-AUTH-03: invalid email format → 422
// ---------------------------------------------------------------------------
describe('TC-AUTH-03: invalid email → 422', () => {
  it('returns 422 for a malformed email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ ...TEACHER, email: 'not-an-email' })
      .expect(422);
  });
});

// ---------------------------------------------------------------------------
// TC-AUTH-04: missing department when required → 422
// ---------------------------------------------------------------------------
describe('TC-AUTH-04: teacher/hod/student without department → 422', () => {
  it('teacher with no department returns 422', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', email: 'x@x.com', password: 'pass1234', role: 'teacher' })
      .expect(422);
  });

  it('hod with no department returns 422', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', email: 'x@x.com', password: 'pass1234', role: 'hod' })
      .expect(422);
  });
});

// ---------------------------------------------------------------------------
// TC-AUTH-05: login (correct credentials) → 200 + new tokens
// ---------------------------------------------------------------------------
describe('TC-AUTH-05: POST /api/auth/login (correct credentials)', () => {
  it('returns 200 with accessToken and refresh cookie', async () => {
    await request(app).post('/api/auth/register').send(TEACHER);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEACHER.email, password: TEACHER.password })
      .expect(200);

    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user.email).toBe(TEACHER.email);
    expect(getCookie(res)).toMatch(/refreshToken=/);
  });
});

// ---------------------------------------------------------------------------
// TC-AUTH-06 + TC-AUTH-07 + TC-AUTH-12: wrong password and non-existent
//   email both return the SAME 401 error (AUTH-12 — never reveal which)
// ---------------------------------------------------------------------------
describe('TC-AUTH-06/07/12: login errors are generic and identical', () => {
  it('wrong password → 401 with generic message', async () => {
    await request(app).post('/api/auth/register').send(TEACHER);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEACHER.email, password: 'wrongpassword' })
      .expect(401);

    expect(res.body.error).toBe('Invalid email or password');
  });

  it('non-existent email → 401 with SAME message (TC-AUTH-12)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' })
      .expect(401);

    expect(res.body.error).toBe('Invalid email or password');
  });
});

// ---------------------------------------------------------------------------
// TC-AUTH-08: refresh with valid cookie → 200 + new accessToken + new cookie
// ---------------------------------------------------------------------------
describe('TC-AUTH-08: POST /api/auth/refresh (valid cookie)', () => {
  it('issues a new accessToken and rotates the cookie', async () => {
    const agent = await registerAgent();
    const res = await agent.post('/api/auth/refresh').expect(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(getCookie(res)).toMatch(/refreshToken=/);
  });
});

// ---------------------------------------------------------------------------
// TC-AUTH-09: refresh with no cookie → 401
// ---------------------------------------------------------------------------
describe('TC-AUTH-09: POST /api/auth/refresh (no cookie)', () => {
  it('returns 401 "Refresh token missing"', async () => {
    const res = await request(app).post('/api/auth/refresh').expect(401);
    expect(res.body.error).toBe('Refresh token missing');
  });
});

// ---------------------------------------------------------------------------
// TC-AUTH-10: logout → 200 + cookie cleared
// ---------------------------------------------------------------------------
describe('TC-AUTH-10: POST /api/auth/logout', () => {
  it('returns 200 and clears the refresh cookie', async () => {
    const agent = await registerAgent();
    const logoutRes = await agent.post('/api/auth/logout').expect(200);
    expect(logoutRes.body.success).toBe(true);

    // Cookie should be cleared (Max-Age=0 or Expires in past)
    const cookie = getCookie(logoutRes);
    const isCleared = cookie === '' || /max-age=0/i.test(cookie) || /expires=/i.test(cookie);
    expect(isCleared).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-AUTH-11: GET /me (valid Bearer) → 200 + user, no hashedPassword
// ---------------------------------------------------------------------------
describe('TC-AUTH-11: GET /api/auth/me', () => {
  it('returns 200 + sanitized user when called with a valid access token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/register')
      .send(TEACHER)
      .expect(201);

    const { accessToken } = loginRes.body as { accessToken: string };
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meRes.body.user.email).toBe(TEACHER.email);
    expect(meRes.body.user.hashedPassword).toBeUndefined();
  });

  it('returns 401 without a token', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });
});

// ---------------------------------------------------------------------------
// EC-AUTH-01: refresh token can only be used once (reuse → 401)
// ---------------------------------------------------------------------------
describe('EC-AUTH-01: refresh token reuse → 401', () => {
  it('second use of the same refresh token is rejected', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send(TEACHER)
      .expect(201);

    // Capture the original cookie string before it is rotated
    const originalCookie = getCookie(registerRes);

    // First use — token is consumed and a new cookie is issued
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', originalCookie)
      .expect(200);

    // Second use of the SAME original token — must be rejected
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', originalCookie);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// EC-AUTH-02: concurrent refresh → exactly one succeeds
// ---------------------------------------------------------------------------
describe('EC-AUTH-02: concurrent refresh requests', () => {
  it('only one of two simultaneous refresh calls succeeds', async () => {
    const loginRes = await request(app)
      .post('/api/auth/register')
      .send(TEACHER)
      .expect(201);

    const cookie = getCookie(loginRes);

    const [r1, r2] = await Promise.all([
      request(app).post('/api/auth/refresh').set('Cookie', cookie),
      request(app).post('/api/auth/refresh').set('Cookie', cookie),
    ]);

    const statuses = [r1.status, r2.status].sort();
    // findOneAndDelete is atomic: exactly one deletes the token and succeeds
    expect(statuses).toEqual([200, 401]);
  });
});

// ---------------------------------------------------------------------------
// EC-AUTH-03: email whitespace + case normalization
// ---------------------------------------------------------------------------
describe('EC-AUTH-03: email normalization (whitespace + case)', () => {
  it('registers with mixed-case/spaces then logs in with lowercase', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ ...TEACHER, email: '  Alice@EXAMPLE.COM  ' })
      .expect(201);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: TEACHER.password })
      .expect(200);

    expect(res.body.user.email).toBe('alice@example.com');
  });

  it('duplicate check is case-insensitive', async () => {
    await request(app).post('/api/auth/register').send(TEACHER).expect(201);
    await request(app)
      .post('/api/auth/register')
      .send({ ...TEACHER, email: 'ALICE@EXAMPLE.COM' })
      .expect(409);
  });
});
