import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { RefreshToken } from '../models/RefreshToken.js';

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ id: userId, role }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
}

export function verifyAccessToken(token: string): { id: string; role: string } {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as { id: string; role: string };
}

export async function createRefreshToken(userId: string): Promise<string> {
  const raw = nanoid(64);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ token: raw, userId, expiresAt });
  return raw;
}

export async function rotateRefreshToken(
  oldToken: string
): Promise<{ userId: string; newToken: string } | null> {
  const found = await RefreshToken.findOneAndDelete({ token: oldToken });
  if (!found || found.expiresAt < new Date()) return null;
  const newToken = await createRefreshToken(found.userId.toString());
  return { userId: found.userId.toString(), newToken };
}
