import { logger } from './logger.js';

export async function withTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// Parse "Please try again in 2.548s" from Groq 429 bodies.
function parseRetryAfterMs(err: unknown): number | null {
  const msg = String(err);
  const match = msg.match(/[Pp]lease try again in (\d+(?:\.\d+)?)s/);
  return match ? Math.ceil(parseFloat(match[1]) * 1000) + 200 : null;
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
      const retryAfterMs = parseRetryAfterMs(err);
      const backoffMs = retryAfterMs ?? 1000 * Math.pow(2, attempt - 1);
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
