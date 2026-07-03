import { Types } from 'mongoose';
import { GenerationRun } from '../models/GenerationRun.js';

const DAILY_LIMIT = Number(process.env.DAILY_TOKEN_LIMIT ?? 100_000);

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Returns true if the user is under their daily token limit.
// Called BEFORE starting a generation run (EC-GEN-13).
// TODO: mid-run exhaustion (blocking a type partway through a multi-type run)
// is a stretch goal — only pre-check is enforced here.
export async function checkAndReserveBudget(userId: string): Promise<boolean> {
  const since = startOfTodayUTC();
  const used = await GenerationRun.aggregate([
    { $match: { userId: new Types.ObjectId(userId), createdAt: { $gte: since } } },
    { $group: { _id: null, total: { $sum: '$tokensUsed' } } },
  ]);
  const usedToday = used[0]?.total ?? 0;
  return usedToday < DAILY_LIMIT;
}
