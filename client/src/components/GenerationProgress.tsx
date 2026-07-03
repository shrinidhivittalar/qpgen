import { QUESTION_TYPE_LABELS, QuestionType, TypeConfig, TypeResult } from '../types';

interface Props {
  typeConfig:   TypeConfig[];
  results:      Record<QuestionType, TypeResult>;
  isGenerating: boolean;
}

function StatusIcon({ status }: { status: TypeResult['status'] }) {
  if (status === 'generating') {
    return (
      <svg className="w-4 h-4 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
    );
  }
  if (status === 'success') {
    return <span className="text-green-600 font-bold">✓</span>;
  }
  if (status === 'failed') {
    return <span className="text-red-500 font-bold">✗</span>;
  }
  return null;
}

export default function GenerationProgress({ typeConfig, results, isGenerating }: Props) {
  const activeTypes = typeConfig.filter(tc => tc.count > 0);

  if (!isGenerating && activeTypes.every(tc => results[tc.type].status === 'idle')) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">
        {isGenerating ? 'Generating questions…' : 'Generation complete'}
      </p>
      {/* Known simplification: backend returns all results at once (not streamed).
          All cards show "Generating…" on submit, then all populate together.
          True per-type streaming (SSE/WebSocket) is out of scope. */}
      <div className="space-y-2">
        {activeTypes.map(tc => {
          const result = results[tc.type];
          return (
            <div
              key={tc.type}
              className={[
                'flex items-center justify-between rounded-lg border px-4 py-3',
                result.status === 'success' ? 'border-green-200 bg-green-50' :
                result.status === 'failed'  ? 'border-red-200 bg-red-50' :
                'border-gray-200 bg-white',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <StatusIcon status={result.status} />
                <span className="text-sm font-medium text-gray-800">
                  {QUESTION_TYPE_LABELS[tc.type]}
                </span>
              </div>

              <span className="text-xs text-gray-500">
                {result.status === 'generating' && 'Generating…'}
                {result.status === 'success'    && `${result.received} / ${tc.count} generated`}
                {result.status === 'failed'     && (
                  <span className="text-red-600">{result.error ?? 'Failed'}</span>
                )}
                {result.status === 'idle'       && '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
