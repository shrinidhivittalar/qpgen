import { ReferenceExemplar } from '../models/ReferenceExemplar.js';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function getExemplars(
  teacherId: string,
  type: string,
  opts: { bankId?: string; subjectHint?: string },
  limit = 3,
): Promise<string[]> {
  if (!teacherId) return [];

  const query: Record<string, unknown> = { teacherId, questionType: type };
  if (opts.bankId) {
    query.bankId = opts.bankId;
  } else if (opts.subjectHint) {
    query.subject = opts.subjectHint;
  }

  let docs = await ReferenceExemplar.find(query).limit(limit * 2).lean();

  if (docs.length === 0 && opts.bankId) {
    // Explicit bank chosen but has no exemplars of this type — fall back
    // to subject-wide search rather than silently generating with zero
    // style guidance for this one type
    docs = await ReferenceExemplar.find({ teacherId, questionType: type }).limit(limit * 2).lean();
  }

  return shuffle(docs).slice(0, limit).map(d => d.rawText as string);
}
