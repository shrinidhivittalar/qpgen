import { Schema, model } from 'mongoose';

const RefreshTokenSchema = new Schema({
  token:     { type: String, required: true, unique: true },
  userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export const RefreshToken = model('RefreshToken', RefreshTokenSchema);
