import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
// express-mongo-sanitize middleware iterates ['body','params','headers','query'] and
// reassigns req[key] — but Express 5 makes req.query a read-only getter, which throws.
// We use the exported sanitize() function directly on req.body only.
import mongoSanitize from 'express-mongo-sanitize';

import { requestIdMiddleware } from './middleware/requestId.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';

const app = express();

app.use(helmet());
app.use(requestIdMiddleware);
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use((req, _res, next) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (req.body) req.body = (mongoSanitize as any).sanitize(req.body) as typeof req.body;
  next();
});

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);

// Catch-all error handler — logs in tests, prevents bare "Internal Server Error" HTML
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[app error]', err.message);
  res.status(500).json({ error: err.message });
});

export default app;
