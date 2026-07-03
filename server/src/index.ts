import 'dotenv/config';
import { validateEnv } from './lib/validateEnv.js';

validateEnv();

import { connectDB } from './db/connect.js';
import { logger } from './lib/logger.js';
import app from './app.js';

const PORT = process.env.PORT || 3001;

connectDB().then(() => {
  app.listen(PORT, () => {
    logger.info('server_started', { port: PORT });
  });
});
