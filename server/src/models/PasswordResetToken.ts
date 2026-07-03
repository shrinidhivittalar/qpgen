import { Schema, model } from 'mongoose';

const PasswordResetTokenSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export const PasswordResetToken = model('PasswordResetToken', PasswordResetTokenSchema);
