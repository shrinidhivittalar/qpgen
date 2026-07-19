import { useState, useMemo } from 'react'
import { TYPE_LABELS, MARKS_DEFAULT } from '../types'
import type { BankQuestion, PaperItem, QuestionType } from '../types'
import { mkUid } from '../utils'

const SELECTABLE_TYPES: QuestionType[] = ['mcq', 'text', 'figure_based', 'table_based', 'multi_part']

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface BlueprintRow {
  id:    string
  type:  QuestionType
  marks: number
  count: number
}

interface Props {
  subject:      string
  source:       string
  sourceLabel:  string
  allQuestions: BankQuestion[]
  paperQids:    Set<string>
  onGenerate:   (items: PaperItem[]) => void
  onCancel:     () => void
}

export function AutoGenerateModal({
  subject, source, sourceLabel, allQuestions, paperQids, onGenerate, onCancel,
}: Props) {
  const [blueprint, setBlueprint] = useState<BlueprintRow[]>(() => [
    { id: mkUid(), type: 'mcq',  marks: 1, count: 10 },
    { id: mkUid(), type: 'text', marks: 2, count: 5  },
  ])

  // Available (not already in paper) per type
  const availableCounts = useMemo(() => {
    const counts: Partial<Record<QuestionType, number>> = {}
    for (const q of allQuestions) {
      if (!paperQids.has(`${subject}:${source}:${q.qid}`)) {
        counts[q.type] = (counts[q.type] ?? 0) + 1
      }
    }
    return counts
  }, [allQuestions, paperQids, subject, source])

  const addRow = () => {
    const used = new Set(blueprint.map(r => r.type))
    const next = SELECTABLE_TYPES.find(
      t => !used.has(t) && (availableCounts[t] ?? 0) > 0
    ) ?? 'text'
    setBlueprint(prev => [
      ...prev,
      { id: mkUid(), type: next, marks: MARKS_DEFAULT[next] ?? 2, count: 1 },
    ])
  }

  const updateRow = (id: string, field: 'type' | 'marks' | 'count', value: string | number) =>
    setBlueprint(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))

  const removeRow = (id: string) =>
    setBlueprint(prev => prev.filter(r => r.id !== id))

  // Per-row validation
  const rowErrors = useMemo(() => {
    const errors: Record<string, string> = {}
    for (const row of blueprint) {
      const avail = availableCounts[row.type] ?? 0
      if (row.count < 1)      errors[row.id] = 'Count must be at least 1'
      else if (row.count > avail) errors[row.id] = `Only ${avail} available`
    }
    return errors
  }, [blueprint, availableCounts])

  const hasErrors      = blueprint.length === 0 || Object.keys(rowErrors).length > 0
  const totalMarks     = blueprint.reduce((s, r) => s + r.marks * r.count, 0)
  const totalQuestions = blueprint.reduce((s, r) => s + r.count, 0)

  const handleGenerate = () => {
    // Build per-type shuffled pools (excluding already-in-paper questions)
    const pools: Partial<Record<QuestionType, BankQuestion[]>> = {}
    for (const q of allQuestions) {
      if (!paperQids.has(`${subject}:${source}:${q.qid}`)) {
        pools[q.type] = pools[q.type] ?? []
        pools[q.type]!.push(q)
      }
    }
    for (const t of Object.keys(pools) as QuestionType[]) {
      pools[t] = shuffle(pools[t]!)
    }

    const items: PaperItem[] = []
    for (const row of blueprint) {
      const picked = (pools[row.type] ?? []).splice(0, row.count)
      for (const q of picked) {
        items.push({
          ...q,
          uid:          mkUid(),
          subject,
          marks:        row.marks,
          isRephrased:  false,
          originalText: q.text,
        })
      }
    }

    onGenerate(items)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Auto-Generate Paper</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Pulling from:{' '}
            <span className="font-medium capitalize">{subject}</span>
            {' / '}
            <span className="font-medium">{sourceLabel}</span>
            <span className="text-gray-400 ml-1">({allQuestions.length} questions total)</span>
          </p>
        </div>

        {/* Blueprint rows */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

          {/* Column labels */}
          <div className="grid grid-cols-[1fr_72px_72px_28px] gap-2 text-[11px] font-semibold
                          text-gray-400 uppercase tracking-wide px-0.5">
            <span>Question type</span>
            <span className="text-center">Marks ea.</span>
            <span className="text-center">Count</span>
            <span />
          </div>

          {blueprint.map(row => {
            const avail = availableCounts[row.type] ?? 0
            const err   = rowErrors[row.id]
            return (
              <div key={row.id} className="space-y-1">
                <div className="grid grid-cols-[1fr_72px_72px_28px] gap-2 items-center">
                  <select
                    value={row.type}
                    onChange={e => updateRow(row.id, 'type', e.target.value)}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white
                               focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {SELECTABLE_TYPES
                      .filter(t => (availableCounts[t] ?? 0) > 0 || t === row.type)
                      .map(t => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]} ({availableCounts[t] ?? 0})
                        </option>
                      ))
                    }
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={row.marks}
                    onChange={e =>
                      updateRow(row.id, 'marks', Math.max(1, parseInt(e.target.value) || 1))
                    }
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-md text-center
                               focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <input
                    type="number"
                    min={1}
                    max={avail || 1}
                    value={row.count}
                    onChange={e =>
                      updateRow(row.id, 'count', Math.max(1, parseInt(e.target.value) || 1))
                    }
                    className={`px-2 py-1.5 text-sm border rounded-md text-center
                               focus:outline-none focus:ring-2 focus:ring-indigo-400
                               ${err ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                  />
                  <button
                    onClick={() => removeRow(row.id)}
                    disabled={blueprint.length === 1}
                    title="Remove row"
                    className="text-gray-300 hover:text-red-400 transition text-xl leading-none
                               disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ×
                  </button>
                </div>
                {err && (
                  <p className="text-xs text-red-600 pl-0.5">⚠ {err} — adjust the count or change type</p>
                )}
              </div>
            )
          })}

          <button
            onClick={addRow}
            disabled={blueprint.length >= SELECTABLE_TYPES.length}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add row
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 bg-gray-50 rounded-b-xl">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-gray-800">{totalMarks}</span> marks
              {' · '}
              <span className="font-semibold text-gray-800">{totalQuestions}</span> questions
            </div>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300
                           text-gray-700 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={hasErrors}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white font-medium
                           hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Generate Paper
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
