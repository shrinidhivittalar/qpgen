import { describe, it, expect } from 'vitest';
import { createLimiter } from '../concurrency.js';

describe('createLimiter', () => {
  it('never executes more than maxConcurrent tasks at once', async () => {
    const limiter = createLimiter(2);
    let running = 0;
    let maxSeen = 0;

    const makeTask = (delayMs: number) =>
      limiter(async () => {
        running++;
        if (running > maxSeen) maxSeen = running;
        await new Promise<void>(resolve => setTimeout(resolve, delayMs));
        running--;
      });

    // Launch 5 tasks simultaneously — only 2 may enter at a time
    await Promise.all([
      makeTask(30),
      makeTask(30),
      makeTask(30),
      makeTask(30),
      makeTask(30),
    ]);

    expect(maxSeen).toBe(2);   // exactly 2 ran concurrently at peak
    expect(running).toBe(0);   // all tasks finished cleanly
  });

  it('resolves all tasks and preserves return values', async () => {
    const limiter = createLimiter(2);

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(n =>
        limiter(async () => {
          await new Promise<void>(resolve => setTimeout(resolve, 5));
          return n * 2;
        }),
      ),
    );

    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('maxConcurrent = 1 behaves as a serial queue', async () => {
    const limiter = createLimiter(1);
    let running = 0;
    let maxSeen = 0;
    const order: number[] = [];

    await Promise.all(
      [1, 2, 3].map(n =>
        limiter(async () => {
          running++;
          if (running > maxSeen) maxSeen = running;
          await new Promise<void>(resolve => setTimeout(resolve, 10));
          order.push(n);
          running--;
        }),
      ),
    );

    expect(maxSeen).toBe(1);
    expect(order).toEqual([1, 2, 3]); // FIFO ordering
  });
});
