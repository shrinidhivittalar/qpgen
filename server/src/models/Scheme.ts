import { Schema, model } from 'mongoose';

const TypeConfigSchema = new Schema(
  {
    type:             { type: String, required: true },
    count:            { type: Number, required: true, min: 1 },
    marksPerQuestion: { type: Number, required: true, min: 0.5 },
  },
  { _id: false },
);

const SchemeSchema = new Schema(
  {
    teacherId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name:         { type: String, required: true, maxlength: 100 },
    subject:      { type: String, required: true },
    standard:     { type: String, required: true },
    examType:     { type: String, default: null },
    rawText:      { type: String, required: true },
    parsedConfig: { type: [TypeConfigSchema], required: true },
    fileType:     { type: String, enum: ['pdf', 'docx'], required: true },
  },
  { timestamps: true },
);

SchemeSchema.index({ teacherId: 1 });

export default model('Scheme', SchemeSchema);
