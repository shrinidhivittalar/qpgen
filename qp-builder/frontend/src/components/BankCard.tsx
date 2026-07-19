import { TYPE_LABELS, TYPE_COLORS } from '../types'
import type { BankQuestion } from '../types'
import { imageUrl } from '../api'
import { cleanText } from '../utils'

const STATIC_SOURCE_LABELS: Record<string, string> = { qp: 'QP', textbook: 'Textbook' }

interface Props {
  question:        BankQuestion
  subject:         string
  source:          string
  sourceLabels:    Record<string, string>   // id -> custom name for uploads/merged
  added:           boolean
  locked:          boolean
  paperSimilarity: number
  crossSimilarity: { sim: number; src: string } | null
  onToggle:        () => void
}

export function BankCard({
  question: q, subject, source, sourceLabels, added, locked,
  paperSimilarity, crossSimilarity, onToggle,
}: Props) {
  const srcLabel = (src: string) => sourceLabels[src] ?? STATIC_SOURCE_LABELS[src] ?? src
  const canAdd = !locked

  const simLevel =
    paperSimilarity >= 0.6 ? 'high'
    : paperSimilarity >= 0.3 ? 'medium'
    : null

  return (
    <li
      className={`rounded-lg border p-3 text-sm transition
        ${added
          ? 'border-indigo-300 bg-indigo-50'
          : locked
          ? 'border-gray-200 bg-gray-50 opacity-60'
          : simLevel === 'high'
          ? 'border-orange-200 bg-orange-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span className="text-xs font-semibold text-gray-400">
              {q.chapter ? `${q.chapter}` : `Q${q.number}`}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[q.type]}`}>
              {TYPE_LABELS[q.type]}
            </span>
            {q.section === 'in_text' && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-sky-50 text-sky-600 border border-sky-200">
                in-text
              </span>
            )}
            {q.has_figure && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-50 text-yellow-600 border border-yellow-200">fig</span>
            )}
            {q.has_table && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-600 border border-purple-200">table</span>
            )}
          </div>

          {/* Similarity warnings */}
          {simLevel && !added && (
            <div className={`flex items-center gap-1 text-xs rounded-md px-2 py-1 mb-1.5
              ${simLevel === 'high'
                ? 'bg-orange-100 text-orange-700'
                : 'bg-yellow-50 text-yellow-700'
              }`}
            >
              <span>{simLevel === 'high' ? '⚠' : '~'}</span>
              <span>
                {simLevel === 'high' ? 'Very similar to' : 'Somewhat similar to'} a question already in your paper
                ({Math.round(paperSimilarity * 100)}% match)
              </span>
            </div>
          )}
          {crossSimilarity && !added && (
            <div className="flex items-center gap-1 text-xs rounded-md px-2 py-1 mb-1.5
                            bg-blue-50 text-blue-700"
            >
              <span>~</span>
              <span>
                Similar to a {srcLabel(crossSimilarity.src)} question
                {' '}already in your paper ({Math.round(crossSimilarity.sim * 100)}% match)
              </span>
            </div>
          )}

          {/* Question text */}
          <p className="text-gray-700 leading-snug line-clamp-3">
            {cleanText(q.text) || <em className="text-gray-400">No text</em>}
          </p>

          {/* Figures */}
          {q.images.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {q.images.map(img => (
                <img
                  key={img.fid}
                  src={imageUrl(subject, source, img.file)}
                  alt={img.fid}
                  className="h-16 w-auto rounded border border-gray-200 object-contain bg-gray-50"
                />
              ))}
            </div>
          )}

          {/* Tables */}
          {q.tables.length > 0 && (
            <div className="mt-2 space-y-1">
              {q.tables.map(tbl => (
                <div key={tbl.tid} className="overflow-x-auto rounded border border-gray-200">
                  <table className="text-xs min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        {tbl.headers.map((h, i) => (
                          <th key={i} className="px-2 py-1 text-left font-medium text-gray-600 border-b border-gray-200">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tbl.rows.map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-gray-50'}>
                          {tbl.headers.map((h, ci) => (
                            <td key={ci} className="px-2 py-1 text-gray-700 border-b border-gray-100 last:border-0">
                              {row[h] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add / Remove button */}
        <button
          onClick={onToggle}
          disabled={locked && !added}
          title={locked ? 'Paper locked to another subject' : added ? 'Remove from paper' : 'Add to paper'}
          className={`shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold
                      transition focus:outline-none focus:ring-2 focus:ring-indigo-400
            ${added
              ? 'bg-indigo-600 text-white hover:bg-red-500'
              : canAdd
              ? 'bg-gray-100 text-gray-500 hover:bg-indigo-600 hover:text-white'
              : 'bg-gray-100 text-gray-300 cursor-not-allowed'
            }`}
        >
          {added ? '✓' : '+'}
        </button>
      </div>
    </li>
  )
}
