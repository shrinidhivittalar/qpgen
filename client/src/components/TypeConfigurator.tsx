import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import {
  ALL_QUESTION_TYPES, QUESTION_TYPE_LABELS,
  TypeConfig, QuestionType, DifficultyLevel, ToneOption, ReferenceBank,
} from '../types';

interface IntentUpdates {
  difficultyDefault?: DifficultyLevel;
  tone?:              ToneOption;
  bankId?:            string | null;
}

interface Props {
  config:            TypeConfig[];
  onChange:          (config: TypeConfig[]) => void;
  difficultyDefault: DifficultyLevel;
  tone:              ToneOption;
  bankId:            string | null;
  onIntentChange:    (updates: IntentUpdates) => void;
  disabled?:         boolean;
}

// ── Segmented control ────────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  options, value, onChange, disabled,
}: {
  options:  { value: T; label: string }[];
  value:    T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-300 w-full">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => !disabled && onChange(opt.value)}
          disabled={disabled}
          className={[
            'flex-1 px-2 py-1.5 text-xs font-medium transition-colors',
            i > 0 ? 'border-l border-gray-300' : '',
            value === opt.value
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50',
            disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const DIFFICULTY_OPTIONS: { value: DifficultyLevel; label: string }[] = [
  { value: 'easy',     label: 'Easy' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'hard',     label: 'Hard' },
];

const TONE_OPTIONS: { value: ToneOption; label: string }[] = [
  { value: 'formal-board-exam', label: 'Board Exam' },
  { value: 'neutral',           label: 'Neutral' },
  { value: 'conversational',    label: 'Conversational' },
];

// ── TypeConfigurator ─────────────────────────────────────────────────────────

function getEntry(config: TypeConfig[], type: QuestionType): TypeConfig | undefined {
  return config.find(c => c.type === type);
}

export default function TypeConfigurator({
  config, onChange, difficultyDefault, tone, bankId, onIntentChange, disabled,
}: Props) {
  const [banks, setBanks] = useState<ReferenceBank[]>([]);
  const [expandedOverrides, setExpandedOverrides] = useState<Set<QuestionType>>(new Set());

  useEffect(() => {
    apiFetch('/api/reference-bank')
      .then(r => (r.ok ? r.json() : []))
      .then((data: ReferenceBank[]) => setBanks(data))
      .catch(() => setBanks([]));
  }, []);

  function toggle(type: QuestionType) {
    const exists = getEntry(config, type);
    if (exists) {
      onChange(config.filter(c => c.type !== type));
      setExpandedOverrides(prev => { const s = new Set(prev); s.delete(type); return s; });
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

  function toggleOverride(type: QuestionType) {
    setExpandedOverrides(prev => {
      const s = new Set(prev);
      if (s.has(type)) {
        s.delete(type);
        // clear per-type difficulty when collapsing
        onChange(config.map(c => c.type === type ? { ...c, difficulty: undefined } : c));
      } else {
        s.add(type);
      }
      return s;
    });
  }

  function updateTypeDifficulty(type: QuestionType, difficulty: DifficultyLevel) {
    onChange(config.map(c => c.type === type ? { ...c, difficulty } : c));
  }

  function updateMapItems(type: QuestionType, raw: string) {
    const items = raw.split('\n').map(s => s.trim()).filter(Boolean);
    onChange(config.map(c => c.type === type ? { ...c, mapItems: items } : c));
  }

  const totalQuestions = config.reduce((s, c) => s + c.count, 0);
  const totalMarks     = config.reduce((s, c) => s + c.count * c.marksPerQuestion, 0);
  const canGenerate    = config.some(c => c.count > 0);

  return (
    <div className="space-y-4">
      {/* ── Intent panel ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
          Generation style
        </p>

        {/* Reference bank */}
        <div className="space-y-1">
          <label className="text-xs text-gray-600">Reference bank</label>
          <select
            value={bankId ?? ''}
            onChange={e => onIntentChange({ bankId: e.target.value || null })}
            disabled={disabled}
            className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
          >
            <option value="">None — use default style</option>
            {banks.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Difficulty default */}
        <div className="space-y-1">
          <label className="text-xs text-gray-600">Difficulty (all types)</label>
          <SegmentedControl
            options={DIFFICULTY_OPTIONS}
            value={difficultyDefault}
            onChange={v => onIntentChange({ difficultyDefault: v })}
            disabled={disabled}
          />
        </div>

        {/* Tone */}
        <div className="space-y-1">
          <label className="text-xs text-gray-600">Tone</label>
          <SegmentedControl
            options={TONE_OPTIONS}
            value={tone}
            onChange={v => onIntentChange({ tone: v })}
            disabled={disabled}
          />
        </div>
      </div>

      {/* ── Per-type cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ALL_QUESTION_TYPES.map(type => {
          const entry    = getEntry(config, type);
          const enabled  = Boolean(entry);
          const expanded = expandedOverrides.has(type);

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

                {enabled && (
                  <button
                    type="button"
                    onClick={() => !disabled && toggleOverride(type)}
                    disabled={disabled}
                    className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors flex items-center gap-0.5 shrink-0"
                  >
                    {expanded ? '▲' : '▶'} Override
                  </button>
                )}
              </div>

              {enabled && entry && (
                <>
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

                  {type === 'mapSkill' && (
                    <div className="mt-3 space-y-1">
                      <label className="text-xs text-gray-500">
                        Map items — one place per line
                        <span className="text-gray-400 ml-1">(required)</span>
                      </label>
                      <textarea
                        rows={5}
                        placeholder={"e.g.\nGanga River\nWestern Ghats\nDeccan Plateau\nBay of Bengal\nHimalayas"}
                        value={entry.mapItems?.join('\n') ?? ''}
                        onChange={e => updateMapItems(type, e.target.value)}
                        disabled={disabled}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y disabled:opacity-60"
                      />
                      <p className="text-xs text-gray-400">
                        Provide 6–8 places the student will mark on the map.
                      </p>
                    </div>
                  )}

                  {expanded && (
                    <div className="mt-3 space-y-1">
                      <span className="text-xs text-gray-500">Difficulty for this type</span>
                      <SegmentedControl
                        options={DIFFICULTY_OPTIONS}
                        value={entry.difficulty ?? difficultyDefault}
                        onChange={v => updateTypeDifficulty(type, v)}
                        disabled={disabled}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Totals bar ─────────────────────────────────────────────────────── */}
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
