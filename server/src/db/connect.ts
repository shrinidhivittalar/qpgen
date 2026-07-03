import mongoose from 'mongoose';
import { logger } from '../lib/logger.js';

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI!;
  try {
    await mongoose.connect(uri);
    logger.info('db_connected', { host: mongoose.connection.host });
  } catch (err) {
    logger.error('db_connection_failed', { error: (err as Error).message });
    process.exit(1);
  }
}
