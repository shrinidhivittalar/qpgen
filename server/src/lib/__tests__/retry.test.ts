import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withTimeout, withRetry } from '../retry.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

// ────────────────────────────────────────────────────────────────────────────
// withTimeout
// ────────────────────────────────────────────────────────────────────────────
describe('withTimeout', () => {
  it('returns the resolved value when fn completes before the deadline', async () => {
    const fn = () => Promise.resolve('ok');
    const result = await withTimeout(fn, 5000, 'test');
    expect(result).toBe('ok');
  });

  it('rejects with a timeout message when fn never resolves', async () => {
    const fn = () => new Promise<never>(() => {}); // hangs forever

    const promise = withTimeout(fn, 1000, 'groq_call');

    // Advance fake clock past the deadline
    vi.advanceTimersByTime(1001);

    await expect(promise).rejects.toThrow('groq_call timed out after 1000ms');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// withRetry
// ────────────────────────────────────────────────────────────────────────────
describe('withRetry', () => {
  it('returns value on 3rd attempt after two 429 failures; fn called exactly 3 times', async () => {
    const err429 = Object.assign(new Error('rate limited'), { status: 429 });
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw err429;
      return 'success';
    });

    const promise = withRetry(fn, 3);

    // First failure: backoff 1000ms (attempt 1, 2^0 * 1000)
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws immediately on a non-retryable error (400); fn called exactly once', async () => {
    const err400 = Object.assign(new Error('bad request'), { status: 400 });
    const fn = vi.fn(async () => { throw err400; });

    await expect(withRetry(fn, 3)).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws the last error after exhausting maxAttempts', async () => {
    const err503 = Object.assign(new Error('service unavailable'), { status: 503 });
    const fn = vi.fn(async () => { throw err503; });

    const promise = withRetry(fn, 3);
    // Attach rejection handler BEFORE advancing timers so the rejection is
    // never unhandled from Node's perspective
    const assertion = expect(promise).rejects.toThrow('service unavailable');
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('treats "timed out" in the error message as retryable', async () => {
    const timeoutErr = new Error('groq_call timed out after 30000ms');
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw timeoutErr;
      return 'recovered';
    });

    const promise = withRetry(fn, 3);
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('respects a custom isRetryable predicate', async () => {
    const customErr = new Error('custom');
    const fn = vi.fn(async () => { throw customErr; });

    // Predicate says: never retry
    await expect(withRetry(fn, 3, () => false)).rejects.toThrow('custom');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
