import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach } from 'vitest';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET  = 'test-access-secret-for-unit-tests-only-min-32-chars!';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-unit-tests-only-min-32-chars!';
  process.env.CLIENT_URL = 'http://localhost:5173';

  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    console.log('[test setup] MongoDB connected:', uri);
  } catch (err) {
    console.error('[test setup] MongoDB startup failed:', (err as Error).message);
    throw err;
  }
}, 120_000); // 2-min ceiling for binary download on cold machine

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(async () => {
  if (mongoose.connection.readyState !== 1) {
    console.warn('[test setup] beforeEach: mongoose not connected (state=%d)', mongoose.connection.readyState);
    return;
  }
  const cols = mongoose.connection.collections;
  for (const key in cols) await cols[key].deleteMany({});
});
