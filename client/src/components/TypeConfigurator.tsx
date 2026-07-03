import { ALL_QUESTION_TYPES, QUESTION_TYPE_LABELS, TypeConfig, QuestionType } from '../types';

interface Props {
  config:    TypeConfig[];
  onChange:  (config: TypeConfig[]) => void;
  disabled?: boolean;
}

function getEntry(config: TypeConfig[], type: QuestionType): TypeConfig | undefined {
  return config.find(c => c.type === type);
}

export default function TypeConfigurator({ config, onChange, disabled }: Props) {
  function toggle(type: QuestionType) {
    const exists = getEntry(config, type);
    if (exists) {
      onChange(config.filter(c => c.type !== type));
    } else {
      onChange([...config, { type, count: 5, marksPerQuestion: 1 }]);
    }
  }

  function update(type: QuestionType, field: 'count' | 'marksPerQuestion', raw: string) {
    const value = field === 'count'
      ? Math.max(0, Math.floor(Number(raw)))
      : Math.max(0.5, Number(raw));
    onChange(config.map(c => c.type === type ? { ...c, [field]: value } : c));
  }

  const totalQuestions = config.reduce((s, c) => s + c.count, 0);
  const totalMarks     = config.reduce((s, c) => s + c.count * c.marksPerQuestion, 0);
  const canGenerate    = config.some(c => c.count > 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ALL_QUESTION_TYPES.map(type => {
          const entry   = getEntry(config, type);
          const enabled = Boolean(entry);

          return (
            <div
              key={type}
              className={[
                'rounded-xl border p-4 transition-colors',
                enabled ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white',
                disabled ? 'opacity-60' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => !disabled && toggle(type)}
                    className="w-4 h-4 rounded accent-indigo-600"
                    disabled={disabled}
                  />
                  <span className="font-medium text-sm text-gray-800">
                    {QUESTION_TYPE_LABELS[type]}
                  </span>
                </label>
              </div>

              {enabled && entry && (
                <div className="mt-3 flex gap-3">
                  <label className="flex flex-col gap-1 flex-1">
                    <span className="text-xs text-gray-500">Count</span>
                    <input
                      type="number"
                      min={1}
                      value={entry.count}
                      onChange={e => update(type, 'count', e.target.value)}
                      disabled={disabled}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </label>
                  <label className="flex flex-col gap-1 flex-1">
                    <span className="text-xs text-gray-500">Marks each</span>
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={entry.marksPerQuestion}
                      onChange={e => update(type, 'marksPerQuestion', e.target.value)}
                      disabled={disabled}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-xl bg-gray-100 px-4 py-3">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-800">{totalQuestions}</span> questions ·{' '}
          <span className="font-semibold text-gray-800">{totalMarks}</span> total marks
        </p>
        {!canGenerate && config.length > 0 && (
          <p className="text-xs text-amber-600">Set at least one count &gt; 0</p>
        )}
      </div>
    </div>
  );
}
