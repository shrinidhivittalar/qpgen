import type { PaperStructure, PaperSection, PaperQuestion } from '../types';

const LABEL_MAP: Record<string, string> = {
  multipleChoice:    'MCQ',
  fillInBlanks:      'Fill in Blanks',
  trueFalse:         'True / False',
  assertionReason:   'Assertion-Reason',
  multiSelect:       'Multi-Select',
  matchTheFollowing: 'Match the Following',
  reordering:        'Reordering',
  sorting:           'Sorting',
  shortAnswer:       'Short Answer',
  longAnswer:        'Long Answer',
};

function StatusBadge({ q }: { q: PaperQuestion }) {
  if (q.error)     return <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">Failed</span>;
  if (q.generated) return <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">Done</span>;
  return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">Pending</span>;
}

function LongAnswerResult({ q }: { q: PaperQuestion }) {
  const gen = q.generated as Record<string, unknown> | null;
  if (!gen) return null;
  const preamble = gen.preamble as string | undefined;
  const parts    = gen.parts    as Array<{ label: string; marks: number; question: string; modelAnswer: string }> | undefined;

  return (
    <div className="mt-3 pl-4 border-l-2 border-blue-200 space-y-3 text-sm">
      {preamble && (
        <p className="text-gray-700 italic">{preamble}</p>
      )}
      {parts?.map((pt, i) => (
        <div key={i} className="space-y-1">
          <p className="font-medium text-gray-800">({pt.label}) {pt.question} <span className="text-gray-400 font-normal">[{pt.marks} marks]</span></p>
          <p className="text-gray-600 text-xs"><span className="font-medium text-gray-500">Model answer:</span> {pt.modelAnswer}</p>
        </div>
      ))}
    </div>
  );
}

function ObjectiveResult({ q }: { q: PaperQuestion }) {
  const gen = q.generated as Record<string, unknown> | null;
  if (!gen) return null;

  const type          = q.type;
  const qBlock        = gen.question as Record<string, unknown> | undefined;
  const text          = qBlock?.text as string | undefined;
  const correctAnswer = gen.correctAnswer;
  const explanation   = gen.explanation as string | undefined;

  return (
    <div className="mt-3 pl-4 border-l-2 border-blue-200 text-sm space-y-2">

      {/* Assertion-Reason: show A and R instead of generic question text */}
      {type === 'assertionReason' ? (
        <>
          <p className="text-gray-800"><span className="font-semibold">Assertion (A):</span> {gen.assertion as string}</p>
          <p className="text-gray-800"><span className="font-semibold">Reason (R):</span> {gen.reason as string}</p>
          <ol className="list-none space-y-0.5">
            {(gen.options as string[] | undefined)?.map((opt, i) => (
              <li key={i} className={`text-xs flex gap-1.5 ${opt === correctAnswer ? 'text-green-700 font-medium' : 'text-gray-500'}`}>
                <span className="shrink-0">({String.fromCharCode(65 + i)})</span>
                <span>{opt}{opt === correctAnswer ? ' ✓' : ''}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        text && <p className="text-gray-800">{text}</p>
      )}

      {/* MCQ / multiSelect — options are objects with .text */}
      {(type === 'multipleChoice' || type === 'multiSelect') && (
        <ol className="list-none space-y-0.5">
          {(gen.options as Array<Record<string, unknown>> | undefined)?.map((opt, i) => {
            const optText   = (opt.text as string ?? '').trim();
            const letter    = String.fromCharCode(65 + i);
            const ca        = correctAnswer as string | string[];
            const isCorrect = Array.isArray(ca)
              ? ca.some(v => v.trim().toLowerCase() === optText.toLowerCase())
              : (ca as string)?.trim().toLowerCase() === optText.toLowerCase();
            return (
              <li key={i} className={`flex gap-2 ${isCorrect ? 'text-green-700 font-medium' : 'text-gray-600'}`}>
                <span className="shrink-0">({letter})</span>
                <span>{optText}</span>
                {isCorrect && <span className="text-green-600 text-xs">✓</span>}
              </li>
            );
          })}
        </ol>
      )}

      {/* True / False */}
      {type === 'trueFalse' && (
        <p className="text-xs text-green-700 font-medium">Answer: {correctAnswer ? 'True' : 'False'}</p>
      )}

      {/* Fill in blanks */}
      {type === 'fillInBlanks' && (
        <p className="text-xs text-green-700 font-medium">Answer: {correctAnswer as string}</p>
      )}

      {/* Match the following — correctAnswer is [{left, right}] */}
      {type === 'matchTheFollowing' && Array.isArray(correctAnswer) && (
        <div className="space-y-0.5 text-xs">
          {(correctAnswer as Array<{ left: string; right: string }>).map((pair, i) => (
            <p key={i} className="text-gray-600">
              {pair.left} <span className="text-gray-400 mx-1">→</span>
              <span className="text-green-700">{pair.right}</span>
            </p>
          ))}
        </div>
      )}

      {/* Reordering — correctAnswer is string[] */}
      {type === 'reordering' && Array.isArray(correctAnswer) && (
        <p className="text-xs text-gray-600">
          Correct order: {(correctAnswer as string[]).join(' → ')}
        </p>
      )}

      {/* Sorting — correctAnswer is Record<category, string[]> */}
      {type === 'sorting' && correctAnswer && typeof correctAnswer === 'object' && !Array.isArray(correctAnswer) && (
        <div className="space-y-0.5 text-xs">
          {Object.entries(correctAnswer as Record<string, string[]>).map(([cat, items]) => (
            <p key={cat} className="text-gray-600">
              <span className="font-medium">{cat}:</span> {items.join(', ')}
            </p>
          ))}
        </div>
      )}

      {/* Short answer model answer + marking scheme */}
      {type === 'shortAnswer' && (
        <>
          {gen.modelAnswer && (
            <div className="bg-blue-50 rounded p-2 text-xs text-gray-700">
              <span className="font-medium text-gray-500">Model answer: </span>
              {gen.modelAnswer as string}
            </div>
          )}
          {Array.isArray(gen.markingScheme) && (gen.markingScheme as Array<{ point: string; marks: number }>).length > 0 && (
            <ul className="text-xs text-gray-500 list-disc list-inside space-y-0.5">
              {(gen.markingScheme as Array<{ point: string; marks: number }>).map((pt, i) => (
                <li key={i}>{pt.point} <span className="text-gray-400">[{pt.marks}m]</span></li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Explanation — shown for all types */}
      {explanation && (
        <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-1">{explanation}</p>
      )}

    </div>
  );
}

function QuestionRow({ q, sectionIdx, qIdx }: { q: PaperQuestion; sectionIdx: number; qIdx: number }) {
  const typeLabel = LABEL_MAP[q.type] ?? q.type;
  const number    = q.number ?? `${sectionIdx + 1}.${qIdx + 1}`;

  return (
    <div className="border border-gray-100 rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-bold text-gray-700 shrink-0">Q{number}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0">
            {typeLabel}
          </span>
          <span className="text-xs text-gray-500 shrink-0">{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
          {q.wordLimit && (
            <span className="text-xs text-gray-400 shrink-0">≤{q.wordLimit} words</span>
          )}
          {q.unitRef && (
            <span className="text-xs text-gray-400 truncate">Unit: {q.unitRef}</span>
          )}
        </div>
        <StatusBadge q={q} />
      </div>

      {q.error && (
        <p className="mt-2 text-xs text-red-600 pl-4">{q.error}</p>
      )}

      {q.generated && q.type === 'longAnswer' && <LongAnswerResult q={q} />}
      {q.generated && q.type !== 'longAnswer' && <ObjectiveResult q={q} />}
    </div>
  );
}

function SectionView({ section, sectionIdx }: { section: PaperSection; sectionIdx: number }) {
  const filled = section.questions.filter(q => q.generated).length;
  const total  = section.questions.length;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between pb-2 border-b border-gray-200">
        <div>
          <h3 className="font-semibold text-gray-900">
            {section.label && <span className="mr-2 text-indigo-600">{section.label}</span>}
            {section.title}
          </h3>
          {section.instructions && (
            <p className="text-sm text-gray-500 mt-0.5">{section.instructions}</p>
          )}
          {section.totalToAttempt != null && section.totalToAttempt < total && (
            <p className="text-xs text-amber-600 mt-0.5">Attempt any {section.totalToAttempt} of {total}</p>
          )}
        </div>
        <div className="text-right text-sm text-gray-500 shrink-0">
          {section.totalMarks != null && <div>{section.totalMarks} marks</div>}
          {filled > 0 && <div className="text-xs text-green-600">{filled}/{total} generated</div>}
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-2">
        {section.questions.map((q, qi) => (
          <QuestionRow key={qi} q={q} sectionIdx={sectionIdx} qIdx={qi} />
        ))}
      </div>
    </div>
  );
}

interface PaperViewProps {
  structure:  PaperStructure;
  /** If true, show a "preview" banner instead of "generated" header */
  isPreview?: boolean;
}

export function PaperView({ structure, isPreview }: PaperViewProps) {
  const totalGenerated = structure.sections
    .flatMap(s => s.questions)
    .filter(q => q.generated).length;
  const totalSlots = structure.sections.flatMap(s => s.questions).length;

  return (
    <div className="space-y-6">
      {/* Paper header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{structure.title || 'Exam Paper'}</h2>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              {structure.totalMarks != null && <span>{structure.totalMarks} marks</span>}
              {structure.duration    && <span>{structure.duration}</span>}
            </div>
            {structure.generalInstructions && structure.generalInstructions.length > 0 && (
              <ul className="mt-2 text-xs text-gray-500 space-y-0.5 list-disc list-inside">
                {structure.generalInstructions.map((instr, i) => (
                  <li key={i}>{instr}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="text-right shrink-0">
            {isPreview ? (
              <span className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200">
                Structure Preview
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200">
                {totalGenerated}/{totalSlots} questions filled
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sections */}
      {structure.sections.map((section, si) => (
        <div key={si} className="bg-gray-50 border border-gray-200 rounded-xl p-5">
          <SectionView section={section} sectionIdx={si} />
        </div>
      ))}
    </div>
  );
}
