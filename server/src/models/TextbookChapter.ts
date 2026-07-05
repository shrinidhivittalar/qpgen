import { Schema, model } from 'mongoose';

const TextbookChapterSchema = new Schema(
  {
    teacherId:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject:           { type: String, required: true, trim: true },
    chapterName:       { type: String, required: true, trim: true },
    chapterNumber:     { type: Number, required: true, min: 1 },
    weightPercent:     { type: Number, required: true, min: 0, max: 100 },
    sourceText:        { type: String, required: true },
    highValueSnippets: { type: [String], default: [] },
  },
  { timestamps: true },
);

TextbookChapterSchema.index({ teacherId: 1, subject: 1 });

export const TextbookChapter = model('TextbookChapter', TextbookChapterSchema);
