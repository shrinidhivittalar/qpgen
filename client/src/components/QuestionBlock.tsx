import { useState, FormEvent } from 'react';
import { QUESTION_TYPE_LABELS, QuestionType } from '../types';
import { LatexText } from './LatexText';

// ── Question shape (superset of all types) ────────────────────────────────────

interface LongAnswerPart {
  label:       string;
  marks:       number;
  question:    string;
  modelAnswer: string;
}

interface Question {
  id:            number;
  marks:         number;
  explanation:   string;
  question?:     { text: string; hide_text: boolean; read_text: boolean; image: string };
  assertion?:    string;
  reason?:       string;
  modelAnswer?:  string | string[];
  correctAnswer: unknown;
  options?:      Array<{ text: string; hide_text: boolean; read_text: boolean; image: string }>;
  leftItems?:    string[];
  rightItems?:   string[];
  items?:        string[];
  categories?:   string[];
  alternatives?: string[];
  wordLimit?:    { min: number; max: number };
  markingScheme?: Array<{ point: string; marks: number }>;
  instruction?:   string;
  totalToAttempt?: number;
  // longAnswer fields
  preamble?:    string;
  parts?:       LongAnswerPart[];
  // figureBased fields
  imageBase64?:   string;
  imageMimeType?: string;
  questionText?:  string;
  subType?:       'mcq' | 'shortAnswer';
  useLatex?:      boolean;
  [key: string]: unknown;
}

interface Props {
  questionType:   string;
  totalMarks:     number;
  questions:      unknown[];
  setId:          string | null;
  isRegenerating: boolean;
  onEdit:         (questionId: number, updated: object) => Promise<void>;
  onRegenerate:   () => void;
}

// ── Tiny icon helpers ─────────────────────────────────────────────────────────

function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin shrink-0`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// ── Inline editor ─────────────────────────────────────────────────────────────

const ASSERTION_OPTIONS = [
  'Both A and R are correct, and R is the correct explanation of A',
  'Both A and R are correct, but R is not the correct explanation of A',
  'A is correct, but R is incorrect',
  'A is incorrect, but R is correct',
] as const;

function QuestionEditor({
  q, type, onSave, onCancel, saving, saveError,
}: {
  q:         Question;
  type:      QuestionType;
  onSave:    (updated: object) => void;
  onCancel:  () => void;
  saving:    boolean;
  saveError: string | null;
}) {
  const isAssert      = type === 'assertionReason';
  const isShort       = type === 'shortAnswer';
  const isTrueFalse   = type === 'trueFalse';
  const isMCQ         = type === 'multipleChoice';
  const isMultiSel    = type === 'multiSelect';
  const isMatch       = type === 'matchTheFollowing';
  const isReorder     = type === 'reordering';
  const isSorting     = type === 'sorting';
  const isFIB         = type === 'fillInBlanks';
  const isMapSkill    = type === 'mapSkill';
  const isFigureBased = type === 'figureBased';
  const isLongAnswer  = type === 'longAnswer';

  // figureBased state
  const [figureQuestionText, setFigureQuestionText] = useState<string>(q.questionText ?? '');
  const [figureSubType,      setFigureSubType]      = useState<'mcq' | 'shortAnswer'>(q.subType ?? 'mcq');
  const [figureOptions,      setFigureOptions]      = useState<string>(
    // options for figureBased are string[], not the MCQ object form
    isFigureBased && Array.isArray(q.options)
      ? (q.options as any[]).map((o: any) => (typeof o === 'string' ? o : o.text ?? '')).join('\n')
      : '',
  );
  const [figureCorrectAnswer, setFigureCorrectAnswer] = useState<string>(
    isFigureBased ? String(q.correctAnswer ?? '') : '',
  );
  const [figureUseLatex, setFigureUseLatex] = useState<boolean>(q.useLatex ?? false);

  // longAnswer state
  const [laPreamble, setLaPreamble] = useState<string>(q.preamble ?? '');
  const [laParts,    setLaParts]    = useState<string>(
    isLongAnswer ? JSON.stringify(q.parts ?? [], null, 2) : '',
  );

  // Primary text
  const [primaryText, setPrimaryText] = useState<string>(
    isAssert ? (q.assertion ?? '') : (q.question?.text ?? ''),
  );
  const [reason,      setReason]      = useState<string>(q.reason ?? '');
  const [explanation, setExplanation] = useState<string>(q.explanation);
  const [modelAnswer, setModelAnswer] = useState<string>(
    Array.isArray(q.modelAnswer) ? (q.modelAnswer as string[]).join('\n') : (q.modelAnswer ?? ''),
  );
  const [mapInstruction,    setMapInstruction]    = useState<string>(q.instruction ?? '');
  const [mapTotalToAttempt, setMapTotalToAttempt] = useState<number>(q.totalToAttempt ?? 0);
  const [alternatives, setAlternatives] = useState<string>(
    Array.isArray(q.alternatives) ? (q.alternatives as string[]).join('\n') : '',
  );

  // Options (MCQ / multiSelect)
  const [options, setOptions] = useState<string>(
    Array.isArray(q.options) ? q.options.map((o: any) => o.text ?? o).join('\n') : '',
  );

  // Correct answer
  const initCA = (): string => {
    if (isTrueFalse) return q.correctAnswer === true ? 'true' : 'false';
    if (typeof q.correctAnswer === 'string') return q.correctAnswer;
    return JSON.stringify(q.correctAnswer, null, 2);
  };
  const [correctAnswer, setCorrectAnswer] = useState<string>(initCA);
  const [caError, setCaError] = useState<string | null>(null);

  // Complex JSON fields
  const [matchLeft,  setMatchLeft]  = useState<string>((q.leftItems  ?? []).join('\n'));
  const [matchRight, setMatchRight] = useState<string>((q.rightItems ?? []).join('\n'));
  const [listItems,  setListItems]  = useState<string>((q.items ?? []).join('\n'));
  const [categories, setCategories] = useState<string>((q.categories ?? []).join('\n'));

  function buildUpdated(): object | null {
    setCaError(null);

    if (isLongAnswer) {
      let parsedParts: LongAnswerPart[];
      try { parsedParts = JSON.parse(laParts); } catch { setCaError('Parts must be valid JSON.'); return null; }
      return {
        id:          q.id,
        marks:       q.marks,
        explanation: explanation.trim(),
        preamble:    laPreamble.trim(),
        parts:       parsedParts,
      };
    }

    if (isFigureBased) {
      const opts = figureSubType === 'mcq'
        ? figureOptions.split('\n').map(l => l.trim()).filter(Boolean)
        : undefined;
      return {
        id:            q.id,
        marks:         q.marks,
        imageBase64:   q.imageBase64,
        imageMimeType: q.imageMimeType,
        questionText:  figureQuestionText.trim(),
        subType:       figureSubType,
        ...(opts ? { options: opts } : {}),
        correctAnswer: figureCorrectAnswer.trim(),
        useLatex:      figureUseLatex,
        explanation:   explanation.trim(),
      };
    }

    // mapSkill has no correctAnswer — build its payload directly
    if (isMapSkill) {
      return {
        id:             q.id,
        marks:          q.marks,
        explanation:    explanation.trim(),
        instruction:    mapInstruction.trim(),
        items:          listItems.split('\n').map(l => l.trim()).filter(Boolean),
        totalToAttempt: mapTotalToAttempt,
        modelAnswer:    modelAnswer.split('\n').map(l => l.trim()).filter(Boolean),
      };
    }

    // Rebuild correctAnswer
    let ca: unknown;
    try {
      if (isTrueFalse)          ca = correctAnswer.trim() === 'true';
      else if (isFIB || isMCQ)  ca = correctAnswer.trim();
      else                       ca = JSON.parse(correctAnswer);
    } catch {
      setCaError('Invalid answer format — must be valid JSON.');
      return null;
    }

    // Base fields shared by all types
    const base: Record<string, unknown> = {
      id:          q.id,
      marks:       q.marks,
      explanation: explanation.trim(),
      correctAnswer: ca,
    };

    if (isAssert) {
      base.assertion = primaryText.trim();
      base.reason    = reason.trim();
      base.options   = ASSERTION_OPTIONS as unknown as string[];
    } else if (isShort) {
      base.question     = { ...(q.question ?? {}), text: primaryText.trim() };
      base.modelAnswer  = modelAnswer.trim();
      base.wordLimit    = q.wordLimit ?? { min: 0, max: 100 };
      base.markingScheme = q.markingScheme ?? [];
    } else {
      base.question = { ...(q.question ?? {}), text: primaryText.trim() };
    }

    if (isMCQ || isMultiSel) {
      const optLines = options.split('\n').map(l => l.trim()).filter(Boolean);
      base.options = optLines.map(t => ({
        hide_text: false, text: t, read_text: false, image: '',
      }));
    }

    if (isFIB) {
      base.alternatives = alternatives.split('\n').map(l => l.trim()).filter(Boolean);
    }

    if (isMatch) {
      base.leftItems  = matchLeft.split('\n').map(l => l.trim()).filter(Boolean);
      base.rightItems = matchRight.split('\n').map(l => l.trim()).filter(Boolean);
    }

    if (isReorder) {
      base.items = listItems.split('\n').map(l => l.trim()).filter(Boolean);
    }

    if (isSorting) {
      base.categories = categories.split('\n').map(l => l.trim()).filter(Boolean);
      base.items      = listItems.split('\n').map(l => l.trim()).filter(Boolean);
    }

    return base;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const updated = buildUpdated();
    if (updated) onSave(updated);
  }

  const inputCls = 'block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4">

      {/* figureBased editor */}
      {isFigureBased && (
        <>
          {/* Read-only image preview */}
          {q.imageBase64 && (
            <div>
              <p className={labelCls}>Figure (read-only)</p>
              <img
                src={`data:${q.imageMimeType ?? 'image/jpeg'};base64,${q.imageBase64}`}
                alt="Figure"
                className="max-h-48 rounded border border-gray-200 object-contain"
              />
            </div>
          )}

          <div>
            <label className={labelCls}>Question text (use $LaTeX$ for math)</label>
            <textarea rows={3} value={figureQuestionText} onChange={e => setFigureQuestionText(e.target.value)}
              className={`${inputCls} resize-y`} required />
            {figureUseLatex && figureQuestionText && (
              <div className="mt-1 text-xs text-gray-500 bg-white rounded p-1 border border-gray-200">
                Preview: <LatexText text={figureQuestionText} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className={labelCls}>Sub-type</label>
              <select value={figureSubType} onChange={e => setFigureSubType(e.target.value as 'mcq' | 'shortAnswer')} className={inputCls}>
                <option value="mcq">MCQ (multiple choice)</option>
                <option value="shortAnswer">Short Answer</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5 pt-4">
              <input type="checkbox" id="useLatex" checked={figureUseLatex}
                onChange={e => setFigureUseLatex(e.target.checked)} className="w-3.5 h-3.5" />
              <label htmlFor="useLatex" className="text-xs text-gray-600">Contains LaTeX</label>
            </div>
          </div>

          {figureSubType === 'mcq' && (
            <div>
              <label className={labelCls}>Options (one per line — plain text or $LaTeX$)</label>
              <textarea rows={4} value={figureOptions} onChange={e => setFigureOptions(e.target.value)}
                className={`${inputCls} resize-y`} />
            </div>
          )}

          <div>
            <label className={labelCls}>
              {figureSubType === 'mcq' ? 'Correct answer (must match an option exactly)' : 'Model answer'}
            </label>
            <textarea rows={2} value={figureCorrectAnswer} onChange={e => setFigureCorrectAnswer(e.target.value)}
              className={`${inputCls} resize-y`} required />
          </div>
        </>
      )}

      {/* longAnswer: preamble + parts JSON */}
      {isLongAnswer && (
        <>
          <div>
            <label className={labelCls}>Case study / preamble</label>
            <textarea rows={4} value={laPreamble} onChange={e => setLaPreamble(e.target.value)}
              className={`${inputCls} resize-y`} required />
          </div>
          <div>
            <label className={labelCls}>
              Sub-parts (JSON array — each: label, marks, question, modelAnswer)
            </label>
            <textarea rows={8} value={laParts} onChange={e => setLaParts(e.target.value)}
              className={`${inputCls} font-mono resize-y`} required />
          </div>
        </>
      )}

      {/* Primary text (not used for mapSkill, figureBased, or longAnswer) */}
      {!isMapSkill && !isFigureBased && !isLongAnswer && (
        <div>
          <label className={labelCls}>{isAssert ? 'Assertion (A)' : isShort ? 'Question' : 'Question text'}</label>
          <textarea rows={3} value={primaryText} onChange={e => setPrimaryText(e.target.value)}
            className={`${inputCls} resize-y`} required />
        </div>
      )}

      {/* mapSkill, figureBased, and longAnswer don't use assertion/reason/short/MCQ/etc sections below */}

      {/* mapSkill: instruction, items, totalToAttempt, modelAnswer */}
      {isMapSkill && (
        <>
          <div>
            <label className={labelCls}>Instruction</label>
            <textarea rows={2} value={mapInstruction} onChange={e => setMapInstruction(e.target.value)}
              className={`${inputCls} resize-y`} required />
          </div>
          <div>
            <label className={labelCls}>Items to identify (one per line)</label>
            <textarea rows={5} value={listItems} onChange={e => setListItems(e.target.value)}
              className={`${inputCls} resize-y`} />
          </div>
          <div>
            <label className={labelCls}>Total to attempt</label>
            <input type="number" min={1} value={mapTotalToAttempt}
              onChange={e => setMapTotalToAttempt(Number(e.target.value))}
              className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Model answers (one per line, in items order)</label>
            <textarea rows={5} value={modelAnswer} onChange={e => setModelAnswer(e.target.value)}
              className={`${inputCls} resize-y`} />
          </div>
        </>
      )}

      {/* Assertion-Reason: reason + correctAnswer dropdown */}
      {isAssert && (
        <>
          <div>
            <label className={labelCls}>Reason (R)</label>
            <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
              className={`${inputCls} resize-y`} required />
          </div>
          <div>
            <label className={labelCls}>Correct answer</label>
            <select value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)} className={inputCls}>
              {ASSERTION_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Short answer: model answer */}
      {isShort && (
        <div>
          <label className={labelCls}>Model answer</label>
          <textarea rows={3} value={modelAnswer} onChange={e => setModelAnswer(e.target.value)}
            className={`${inputCls} resize-y`} required />
        </div>
      )}

      {/* MCQ / MultiSelect: options list */}
      {(isMCQ || isMultiSel) && (
        <div>
          <label className={labelCls}>Options (one per line)</label>
          <textarea rows={4} value={options} onChange={e => setOptions(e.target.value)}
            className={`${inputCls} resize-y`} />
        </div>
      )}

      {/* trueFalse: toggle */}
      {isTrueFalse && (
        <div>
          <label className={labelCls}>Correct answer</label>
          <select value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)} className={inputCls}>
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </div>
      )}

      {/* fillInBlanks: answer + alternatives */}
      {isFIB && (
        <>
          <div>
            <label className={labelCls}>Correct answer</label>
            <input type="text" value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)}
              className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Alternative answers (one per line, optional)</label>
            <textarea rows={2} value={alternatives} onChange={e => setAlternatives(e.target.value)}
              className={`${inputCls} resize-y`} />
          </div>
        </>
      )}

      {/* MCQ: correctAnswer text (must match an option) */}
      {isMCQ && (
        <div>
          <label className={labelCls}>Correct answer (must match an option exactly)</label>
          <input type="text" value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)}
            className={inputCls} required />
        </div>
      )}

      {/* matchTheFollowing: left/right columns */}
      {isMatch && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Left items (one per line)</label>
              <textarea rows={4} value={matchLeft} onChange={e => setMatchLeft(e.target.value)}
                className={`${inputCls} resize-y`} />
            </div>
            <div>
              <label className={labelCls}>Right items (one per line)</label>
              <textarea rows={4} value={matchRight} onChange={e => setMatchRight(e.target.value)}
                className={`${inputCls} resize-y`} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Correct answer (JSON — array of &#123;left, right&#125; pairs)</label>
            <textarea rows={4} value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)}
              className={`${inputCls} font-mono resize-y`} />
          </div>
        </>
      )}

      {/* reordering: items + correct order */}
      {isReorder && (
        <>
          <div>
            <label className={labelCls}>Items (one per line — correct order)</label>
            <textarea rows={4} value={listItems} onChange={e => setListItems(e.target.value)}
              className={`${inputCls} resize-y`} />
          </div>
          <div>
            <label className={labelCls}>Correct answer (JSON array — ordered list)</label>
            <textarea rows={3} value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)}
              className={`${inputCls} font-mono resize-y`} />
          </div>
        </>
      )}

      {/* sorting: categories, items, correctAnswer */}
      {isSorting && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Categories (one per line)</label>
              <textarea rows={3} value={categories} onChange={e => setCategories(e.target.value)}
                className={`${inputCls} resize-y`} />
            </div>
            <div>
              <label className={labelCls}>Items (one per line)</label>
              <textarea rows={3} value={listItems} onChange={e => setListItems(e.target.value)}
                className={`${inputCls} resize-y`} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Correct answer (JSON — &#123;"Category": ["item1", ...]&#125;)</label>
            <textarea rows={4} value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)}
              className={`${inputCls} font-mono resize-y`} />
          </div>
        </>
      )}

      {/* multiSelect correctAnswer */}
      {isMultiSel && (
        <div>
          <label className={labelCls}>Correct answers (JSON array of strings)</label>
          <textarea rows={2} value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)}
            className={`${inputCls} font-mono resize-y`} />
        </div>
      )}

      {/* Explanation — always shown */}
      <div>
        <label className={labelCls}>Explanation</label>
        <textarea rows={2} value={explanation} onChange={e => setExplanation(e.target.value)}
          className={`${inputCls} resize-y`} required />
      </div>

      {/* Errors */}
      {caError   && <p className="text-xs text-red-600">{caError}</p>}
      {saveError && <p className="text-xs text-red-600">{saveError}</p>}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg py-1.5 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 rounded-lg py-1.5 text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Question card (view + edit) ───────────────────────────────────────────────

function QuestionCard({
  q, index, type, onEdit,
}: {
  q:      Question;
  index:  number;
  type:   QuestionType;
  onEdit: (questionId: number, updated: object) => Promise<void>;
}) {
  const [editing,   setEditing]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave(updated: object) {
    setSaving(true);
    setSaveError(null);
    try {
      await onEdit(q.id, updated);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <QuestionEditor
        q={q} type={type}
        onSave={handleSave}
        onCancel={() => { setEditing(false); setSaveError(null); }}
        saving={saving}
        saveError={saveError}
      />
    );
  }

  const isAssertionReason = type === 'assertionReason';
  const isMapSkillCard    = type === 'mapSkill';
  const isFigureCard      = type === 'figureBased';
  const isLongAnswerCard  = type === 'longAnswer';

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {isLongAnswerCard ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 font-medium">#{index + 1}</p>
              {q.preamble && (
                <p className="text-sm text-gray-700 italic bg-amber-50 border border-amber-100 rounded px-2.5 py-2">
                  {q.preamble}
                </p>
              )}
              {Array.isArray(q.parts) && (q.parts as LongAnswerPart[]).map((part, pi) => (
                <div key={pi} className="flex items-start gap-2 pl-1">
                  <span className="text-xs font-bold text-gray-500 shrink-0 mt-0.5 w-5">({part.label})</span>
                  <p className="text-sm text-gray-800 flex-1">{part.question}</p>
                  <span className="text-xs text-gray-400 shrink-0">[{part.marks}m]</span>
                </div>
              ))}
            </div>
          ) : isFigureCard ? (
            <div className="space-y-1">
              <p className="text-xs text-gray-400 font-medium">#{index + 1}</p>
              {q.imageBase64 && (
                <img
                  src={`data:${q.imageMimeType ?? 'image/jpeg'};base64,${q.imageBase64}`}
                  alt="Figure"
                  className="max-h-24 rounded border border-gray-100 object-contain"
                />
              )}
              {q.questionText && (
                q.useLatex
                  ? <LatexText text={q.questionText} className="text-sm text-gray-800 block" />
                  : <p className="text-sm text-gray-800">{q.questionText}</p>
              )}
              {q.correctAnswer != null && (
                <p className="text-xs text-indigo-700 bg-indigo-50 rounded px-2 py-1 mt-1">
                  ✓ {String(q.correctAnswer)}
                </p>
              )}
            </div>
          ) : isAssertionReason ? (
            <div className="space-y-1">
              <p className="text-xs text-gray-400 font-medium">#{index + 1}</p>
              <p className="text-sm text-gray-800">
                <span className="font-semibold">(A)</span> {q.assertion ?? ''}
              </p>
              <p className="text-sm text-gray-800">
                <span className="font-semibold">(R)</span> {q.reason ?? ''}
              </p>
              {q.correctAnswer != null && (
                <p className="text-xs text-indigo-700 bg-indigo-50 rounded px-2 py-1 mt-1">
                  ✓ {String(q.correctAnswer)}
                </p>
              )}
            </div>
          ) : isMapSkillCard ? (
            <div className="space-y-1">
              <p className="text-xs text-gray-400 font-medium">#{index + 1}</p>
              <p className="text-sm text-gray-800">{q.instruction ?? 'Map Skill Question'}</p>
              {Array.isArray(q.items) && (q.items as string[]).length > 0 && (
                <>
                  <p className="text-xs text-gray-500">
                    Identify any {(q.totalToAttempt as number | undefined) ?? '?'} of {(q.items as string[]).length} items
                  </p>
                  <ol className="list-decimal list-inside text-xs text-gray-600 space-y-0.5">
                    {(q.items as string[]).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm font-medium text-gray-800">
              <span className="text-gray-400 mr-1">#{index + 1}</span>
              {q.question?.text ?? (Array.isArray(q.modelAnswer) ? (q.modelAnswer as string[])[0] : q.modelAnswer) ?? 'Question'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
            {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
          </span>
          <button
            onClick={() => { setEditing(true); setSaveError(null); }}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-1.5 py-0.5 rounded hover:bg-indigo-50 transition-colors"
          >
            Edit
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 italic">{q.explanation}</p>
    </div>
  );
}

// ── QuestionBlock ─────────────────────────────────────────────────────────────

export default function QuestionBlock({
  questionType, totalMarks, questions, isRegenerating, onEdit, onRegenerate,
}: Props) {
  const [open, setOpen] = useState(false);
  const label = QUESTION_TYPE_LABELS[questionType as QuestionType] ?? questionType;

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="w-full flex items-center justify-between px-5 py-4 bg-white">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <div>
            <p className="font-semibold text-gray-800 text-sm">{label}</p>
            <p className="text-xs text-gray-500">
              {questions.length} {questions.length === 1 ? 'question' : 'questions'} · {totalMarks} marks
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {isRegenerating ? (
            <span className="flex items-center gap-1.5 text-xs text-indigo-600">
              <Spinner className="w-3.5 h-3.5" />
              Regenerating…
            </span>
          ) : (
            <button
              onClick={onRegenerate}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors border border-indigo-200"
            >
              Regenerate
            </button>
          )}
          <span className="text-xs font-medium text-green-600 bg-green-50 border border-green-100 rounded px-2 py-0.5">
            Generated
          </span>
        </div>
      </div>

      {/* Question list */}
      {open && (
        <div className={`border-t border-gray-100 bg-gray-50 p-4 space-y-2 ${isRegenerating ? 'opacity-50 pointer-events-none' : ''}`}>
          {(questions as Question[]).map((q, i) => (
            <QuestionCard
              key={q.id ?? i}
              q={q} index={i}
              type={questionType as QuestionType}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
