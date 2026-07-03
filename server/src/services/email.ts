import { logger } from '../lib/logger.js';

// TODO: wire nodemailer for real SMTP delivery
export async function sendPasswordResetEmail(
  _email: string,
  rawToken: string
): Promise<void> {
  logger.info('password_reset_email_stub', { tokenPreview: rawToken.slice(0, 8) });
}
