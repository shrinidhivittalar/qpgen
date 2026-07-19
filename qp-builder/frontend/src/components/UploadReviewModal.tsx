import { useState } from 'react'
import type { RawQuestion } from '../types'
import { TYPE_LABELS, TYPE_COLORS } from '../types'

interface Props {
  name:      string
  questions: RawQuestion[]
  warnings:  string[]
  saving:    boolean
  onConfirm: (name: string, questions: RawQuestion[]) => void
  onCancel:  () => void
}

export function UploadReviewModal({ name: initialName, questions: initial, warnings, saving, onConfirm, onCancel }: Props) {
  const [name, setName]           = useState(initialName)
  const [questions, setQuestions] = useState(initial)

  const remove = (idx: number) =>
    setQuestions(prev => prev.filter((_, i) => i !== idx))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Review Parsed Questions</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">Paper name:</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md
                         focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="mx-6 mt-4 shrink-0 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-xs font-semibold text-amber-800 mb-1">Heads up</p>
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700">{w}</p>
            ))}
          </div>
        )}

        {/* Question list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {questions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No questions remaining.</p>
          ) : questions.map((q, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-lg border border-gray-100
                         hover:border-gray-200 bg-gray-50"
            >
              <span className="shrink-0 w-7 h-7 rounded-full bg-white border border-gray-200
                               flex items-center justify-center text-xs font-medium text-gray-500">
                {q.number}
              </span>
              <p className="flex-1 min-w-0 text-sm text-gray-800 line-clamp-2">{q.text}</p>
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium
                               ${TYPE_COLORS[q.type] ?? 'bg-gray-100 text-gray-600'}`}>
                {TYPE_LABELS[q.type] ?? q.type}
              </span>
              <button
                onClick={() => remove(idx)}
                title="Remove this question"
                className="shrink-0 text-gray-300 hover:text-red-400 transition text-xl leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center
                        shrink-0 bg-gray-50 rounded-b-xl">
          <span className="text-xs text-gray-500">
            {questions.length} question{questions.length !== 1 ? 's' : ''} will be saved
          </span>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300
                         text-gray-700 hover:bg-gray-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(name.trim(), questions)}
              disabled={saving || questions.length === 0 || !name.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white font-medium
                         hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {saving ? 'Saving...' : `Save ${questions.length} questions`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
