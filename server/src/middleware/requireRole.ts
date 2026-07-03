import type { Request, Response, NextFunction } from 'express';

export function requireRole(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!allowed.includes(req.role)) {
      res.status(403).json({ error: "You don't have permission to do this." });
      return;
    }
    next();
  };
}
