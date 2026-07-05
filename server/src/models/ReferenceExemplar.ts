import { Schema, model } from 'mongoose';

const ReferenceExemplarSchema = new Schema(
  {
    teacherId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    questionType: { type: String, required: true },
    bankId:       { type: String, default: null },
    subject:      { type: String, default: null },
    rawText:      { type: String, required: true },
  },
  { timestamps: true },
);

ReferenceExemplarSchema.index({ teacherId: 1, questionType: 1 });
ReferenceExemplarSchema.index({ teacherId: 1, questionType: 1, bankId: 1 });
ReferenceExemplarSchema.index({ teacherId: 1, questionType: 1, subject: 1 });

export const ReferenceExemplar = model('ReferenceExemplar', ReferenceExemplarSchema);
