import { Schema, model } from 'mongoose';

const UserSchema = new Schema(
  {
    name:           { type: String, required: true, trim: true },
    email:          { type: String, required: true, unique: true, lowercase: true, trim: true },
    hashedPassword: { type: String, required: true },
    role:           { type: String, required: true, enum: ['principal', 'hod', 'teacher', 'student'] },
    department:     { type: String, required: false },
  },
  { timestamps: true }
);

UserSchema.index({ role: 1 });
UserSchema.index({ department: 1 });

export const User = model('User', UserSchema);
