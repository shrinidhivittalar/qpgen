import { logger } from './logger.js';

export async function withTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  isRetryable: (err: unknown) => boolean = defaultIsRetryable,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isRetryable(err)) throw err;
      const backoffMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s (GEN-23)
      logger.warn('groq_retry', { attempt, backoffMs, error: String(err) });
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
}

function defaultIsRetryable(err: unknown): boolean {
  const status = (err as any)?.status ?? (err as any)?.response?.status;
  return status === 429 || status === 503 || String(err).includes('timed out');
}
