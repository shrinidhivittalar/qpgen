import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { signAccessToken, createRefreshToken, rotateRefreshToken } from '../auth/tokens.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPasswordResetEmail } from '../services/email.js';
import { logger } from '../lib/logger.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

router.use(authLimiter);

// --- Validation schemas ---

const RegisterSchema = z
  .object({
    name:       z.string().min(1),
    email:      z.string().trim().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email'),
    password:   z.string().min(8, 'Password must be at least 8 characters'),
    role:       z.enum(['principal', 'hod', 'teacher', 'student']),
    department: z.string().optional(),
  })
  .refine(
    (d) => !['hod', 'teacher', 'student'].includes(d.role) || !!d.department,
    { message: 'Department is required for this role', path: ['department'] }
  );

const LoginSchema = z.object({
  email:    z.string().min(1),
  password: z.string().min(1),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

const ResetPasswordSchema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// --- Cookie helpers ---

const COOKIE_NAME = 'refreshToken';

function refreshCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure:   isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000,
  };
}

function clearCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure:   isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  };
}

// --- POST /register ---

router.post('/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.issues });
    return;
  }

  const { name, email, password, role, department } = parsed.data;

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email: email.trim().toLowerCase(),
      hashedPassword,
      role,
      department,
    });

    const accessToken  = signAccessToken(user._id.toString(), role);
    const refreshToken = await createRefreshToken(user._id.toString());

    res.cookie(COOKIE_NAME, refreshToken, refreshCookieOptions());
    res.status(201).json({
      user: {
        id:         user._id,
        name:       user.name,
        email:      user.email,
        role:       user.role,
        department: user.department ?? null,
      },
      accessToken,
    });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    logger.error('register_error', { requestId: req.requestId, error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- POST /login ---

router.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.issues });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });

    // Always run bcrypt to prevent user-enumeration via timing (AUTH-12)
    const passwordMatch = user
      ? await bcrypt.compare(password, user.hashedPassword)
      : false;

    if (!user || !passwordMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const accessToken  = signAccessToken(user._id.toString(), user.role);
    const refreshToken = await createRefreshToken(user._id.toString());

    res.cookie(COOKIE_NAME, refreshToken, refreshCookieOptions());
    res.status(200).json({
      user: {
        id:         user._id,
        name:       user.name,
        email:      user.email,
        role:       user.role,
        department: user.department ?? null,
      },
      accessToken,
    });
  } catch (err: unknown) {
    logger.error('login_error', { requestId: req.requestId, error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- POST /refresh ---

router.post('/refresh', async (req, res) => {
  const token: string | undefined = req.cookies[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Refresh token missing' });
    return;
  }

  try {
    const result = await rotateRefreshToken(token);
    if (!result) {
      res.clearCookie(COOKIE_NAME, clearCookieOptions());
      res.status(401).json({ error: 'Refresh token invalid or expired' });
      return;
    }

    const { userId, newToken } = result;
    const user = await User.findById(userId).select('role').lean();
    if (!user) {
      res.status(401).json({ error: 'Refresh token invalid or expired' });
      return;
    }

    const accessToken = signAccessToken(userId, user.role as string);
    res.cookie(COOKIE_NAME, newToken, refreshCookieOptions());
    res.status(200).json({ accessToken });
  } catch (err: unknown) {
    logger.error('refresh_error', { requestId: req.requestId, error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- POST /logout ---

router.post('/logout', async (req, res) => {
  const token: string | undefined = req.cookies[COOKIE_NAME];
  if (token) {
    // Best-effort delete — ignore if already gone
    await RefreshToken.deleteOne({ token }).catch(() => null);
  }
  res.clearCookie(COOKIE_NAME, clearCookieOptions());
  res.status(200).json({ success: true });
});

// --- GET /me ---

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-hashedPassword').lean();
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.status(200).json({ user });
  } catch (err: unknown) {
    logger.error('me_error', { requestId: req.requestId, error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- POST /forgot-password ---

router.post('/forgot-password', async (req, res) => {
  const parsed = ForgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    // Still 200 — never reveal whether the email exists (AUTH-26)
    res.status(200).json({ success: true });
    return;
  }

  const { email } = parsed.data;

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() }).lean();
    if (user) {
      // Delete any existing token first to prevent accumulation (AUTH-28 / EC-AUTH-04)
      await PasswordResetToken.deleteMany({ userId: user._id });

      const rawToken  = nanoid(64);
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await PasswordResetToken.create({ tokenHash, userId: user._id, expiresAt });
      await sendPasswordResetEmail(user.email, rawToken);
    }
  } catch (err: unknown) {
    logger.error('forgot_password_error', {
      requestId: req.requestId,
      error: (err as Error).message,
    });
  }

  // Always 200 regardless of outcome (AUTH-26)
  res.status(200).json({ success: true });
});

// --- POST /reset-password ---

router.post('/reset-password', async (req, res) => {
  const parsed = ResetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'This reset link has expired or is invalid.' });
    return;
  }

  const { token, password } = parsed.data;

  try {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record    = await PasswordResetToken.findOne({ tokenHash });

    if (!record || record.expiresAt < new Date()) {
      res.status(400).json({ error: 'This reset link has expired or is invalid.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await User.updateOne({ _id: record.userId }, { hashedPassword });
    await PasswordResetToken.deleteOne({ _id: record._id });

    res.status(200).json({ success: true });
  } catch (err: unknown) {
    logger.error('reset_password_error', {
      requestId: req.requestId,
      error: (err as Error).message,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
