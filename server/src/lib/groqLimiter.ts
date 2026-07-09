// Rolling token-window rate limiter for Groq's 30 000 TPM on-demand limit.
//
// groqAcquire() atomically CHECK+RESERVE in a brief lock, then returns.
// If the window is full it releases the lock, waits OUTSIDE it, then retries.
// This lets all blocked callers wait in PARALLEL — they all unblock at the same
// time and then race through the lock one-by-one as each slot reserves.
//
// Worst-case latency for N questions (batch size B = floor(TPM_LIMIT/EST_TOKENS)):
//   ceil(N / B) - 1  ×  ~60 s  +  small concurrent-call overhead
//
// Env overrides:
//   GROQ_TPM_LIMIT   default 27 000  (90 % of the 30 000 on-demand limit)
//   GROQ_EST_TOKENS  default 2 500   (pessimistic per-call token estimate)

import { logger } from './logger.js';

const TPM_LIMIT  = Number(process.env.GROQ_TPM_LIMIT  ?? 27_000);
const EST_TOKENS = Number(process.env.GROQ_EST_TOKENS ?? 2_500);
const WINDOW_MS  = 60_000;

const windowCalls: Array<{ expiry: number; tokens: number }> = [];

function pruneWindow() {
  const now = Date.now();
  while (windowCalls.length > 0 && windowCalls[0].expiry <= now) windowCalls.shift();
}

function tokensUsed(): number {
  pruneWindow();
  return windowCalls.reduce((s, c) => s + c.tokens, 0);
}

// The lock serialises only the CHECK+RESERVE step — it is held for microseconds,
// never for the duration of a wait.
let _lock: Promise<void> = Promise.resolve();

function tryReserve(tokens: number): Promise<boolean> {
  return new Promise(resolve => {
    const myTurn = _lock.then(() => {
      if (tokensUsed() + tokens <= TPM_LIMIT) {
        windowCalls.push({ expiry: Date.now() + WINDOW_MS, tokens });
        resolve(true);
      } else {
        resolve(false);
      }
    });
    // Advance the chain regardless of success/failure so subsequent callers proceed.
    _lock = myTurn.then(() => {}, () => {});
  });
}

// tokens defaults to EST_TOKENS (text calls).
// Vision calls should pass a higher value, e.g. groqAcquire(EST_TOKENS * 2),
// because the image consumes additional input tokens beyond the text prompt.
export async function groqAcquire(tokens = EST_TOKENS): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const reserved = await tryReserve(tokens);
    if (reserved) return;

    // Capacity unavailable — wait OUTSIDE the lock so other callers can also wait
    // in parallel and all wake up together when the window rolls.
    pruneWindow();
    const oldest = windowCalls[0];
    const delay  = oldest
      ? Math.max(200, oldest.expiry - Date.now() + 200)
      : 5_000;
    logger.info('groq_tpm_throttle', {
      usedTokens:  tokensUsed(),
      limitTokens: TPM_LIMIT,
      delayMs:     delay,
    });
    await new Promise<void>(r => setTimeout(r, delay));
  }
}
