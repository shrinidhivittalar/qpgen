import { Schema } from 'mongoose';

export const TypeConfigSchema = new Schema(
  {
    type:             { type: String, required: true },
    count:            { type: Number, required: true, min: 1 },
    marksPerQuestion: { type: Number, required: true, min: 0.5 },
    difficulty:       { type: String, enum: ['easy', 'moderate', 'hard'], default: null },
  },
  { _id: false },
);
