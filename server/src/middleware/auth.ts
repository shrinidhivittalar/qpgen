import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../auth/tokens.js';

declare global {
  namespace Express {
    interface Request {
      userId: string;
      role: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.id;
    req.role = payload.role;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

