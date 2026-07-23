import { useMemo } from 'react'
import type { PaperTab } from '../types'
import type { User } from '../api'

interface Props {
  subjectMap:      Record<string, Record<string, number>>
  uploadedSources: Record<string, { name: string; count: number }>
  papers:          PaperTab[]
  onBrowseAndBuild:          () => void
  onUploadBank:              () => void
  onGenerateFromBlueprint:   () => void
  onOpenPaper:               (id: string) => void
  user:                      User
}

const SUBJECT_LABELS: Record<string, string> = {
  science: 'Science',
  maths:   'Mathematics',
  social:  'Social Science',
  english: 'English',
  kannada: 'Kannada',
  hindi:   'Hindi',
}

const SOURCE_LABELS: Record<string, string> = {
  qp: 'Question Paper',
  tb: 'Textbook',
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function Dashboard({
  subjectMap,
  uploadedSources,
  papers,
  onBrowseAndBuild,
  onUploadBank,
  onGenerateFromBlueprint,
  onOpenPaper,
  user,
}: Props) {
  const totalQuestions = useMemo(() => {
    let n = 0
    for (const srcs of Object.values(subjectMap))
      for (const c of Object.values(srcs)) n += c
    for (const u of Object.values(uploadedSources)) n += u.count
    return n
  }, [subjectMap, uploadedSources])

  const subjectCount  = Object.keys(subjectMap).length
  const activePapers  = papers.filter(p => p.items.length > 0)
  const isViewer = user.role === 'Viewer'

  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f3ef]">
      <div className="max-w-4xl mx-auto px-8 py-12">

        {/* ── Greeting & Welcome header ──────────────────────────────────── */}
        <div className="mb-10 flex justify-between items-start">
          <div>
            <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider mb-1">
              {greeting()}, {user.username}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
              Workspace Overview
            </h1>
          </div>
          {isViewer && (
            <div className="px-3 py-1.5 bg-stone-100 text-[11px] text-stone-500 rounded-lg max-w-[280px]">
              🔒 You have <strong>Viewer</strong> access. Editing features are disabled.
            </div>
          )}
        </div>

        {/* ── Metric Grid ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          {[
            { value: totalQuestions, label: 'Questions in bank',  sub: 'across all subjects' },
            { value: subjectCount,   label: 'Subjects available', sub: 'ready to use'         },
            { value: activePapers.length, label: 'Papers built',  sub: 'this session'         },
          ].map(s => (
            <div
              key={s.label}
              className="bg-[#faf9f7] rounded-xl border border-stone-200 p-5 shadow-sm hover:border-stone-300 transition-colors"
            >
              <div className="font-mono text-2xl font-medium text-stone-900 tabular-nums mb-1">
                {s.value.toLocaleString()}
              </div>
              <div className="text-xs font-semibold text-stone-700">{s.label}</div>
              <div className="text-[10px] text-stone-400 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Action Cards ─────────────────────────────────────────────── */}
        <div className="mb-12">
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-4">
            Actions
          </p>
          <div className="grid grid-cols-3 gap-4">
            {/* Browse & Build */}
            <button
              onClick={onBrowseAndBuild}
              className="group text-left bg-[#faf9f7] rounded-xl border border-stone-200 p-5 shadow-sm
                         hover:border-stone-400 transition-all focus:outline-none"
            >
              <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center mb-4 text-sm" aria-hidden="true">
                🔍
              </div>
              <div className="text-xs font-semibold text-stone-900 mb-1">
                Browse & Build
              </div>
              <div className="text-[11px] text-stone-500 leading-relaxed">
                Search question banks, review duplicates, and hand-pick questions.
              </div>
            </button>

            {/* Upload Bank */}
            <button
              onClick={!isViewer ? onUploadBank : undefined}
              disabled={isViewer}
              className="group text-left bg-[#faf9f7] rounded-xl border border-stone-200 p-5 shadow-sm
                         hover:border-stone-400 transition-all focus:outline-none
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-stone-200"
            >
              <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center mb-4 text-sm" aria-hidden="true">
                📥
              </div>
              <div className="text-xs font-semibold text-stone-900 mb-1">
                Upload Question Bank
              </div>
              <div className="text-[11px] text-stone-500 leading-relaxed">
                Add a past paper or question bank PDF. Parsed automatically.
              </div>
            </button>

            {/* Blueprint */}
            <button
              disabled
              className="group text-left bg-stone-50/80 rounded-xl border border-stone-200/60 p-5 opacity-50 cursor-not-allowed"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-sm" aria-hidden="true">
                  📋
                </div>
                <span className="text-[9px] font-medium tracking-wider bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded">
                  Soon
                </span>
              </div>
              <div className="text-xs font-semibold text-stone-700 mb-1">
                Generate from Blueprint
              </div>
              <div className="text-[11px] text-stone-400 leading-relaxed">
                Upload board blueprints to auto-assemble balanced papers.
              </div>
            </button>
          </div>
        </div>

        {/* ── Library Breakdown ────────────────────────────────────────── */}
        {(Object.keys(subjectMap).length > 0 || Object.keys(uploadedSources).length > 0) && (
          <div className="mb-12">
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-4">
              Library
            </p>
            <div className="bg-[#faf9f7] rounded-xl border border-stone-200 overflow-hidden shadow-sm">
              {Object.entries(subjectMap).map(([subj, srcs], idx, arr) => {
                const total = Object.values(srcs).reduce((a, b) => a + b, 0)
                const srcList = Object.entries(srcs)
                  .map(([src, n]) => `${SOURCE_LABELS[src] ?? src.toUpperCase()} (${n})`)
                  .join(' · ')
                return (
                  <div
                    key={subj}
                    className={`flex items-center justify-between px-5 py-4 ${
                      idx < arr.length - 1 || Object.keys(uploadedSources).length > 0
                        ? 'border-b border-stone-100'
                        : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-stone-800 capitalize">
                        {SUBJECT_LABELS[subj] ?? subj}
                      </span>
                      <span className="ml-3 text-[11px] text-stone-400 font-mono">{srcList}</span>
                    </div>
                    <span className="font-mono text-xs font-semibold text-stone-600 tabular-nums">
                      {total.toLocaleString()} <span className="font-normal text-[10px] text-stone-400">questions</span>
                    </span>
                  </div>
                )
              })}

              {Object.entries(uploadedSources).map(([id, info], idx, arr) => (
                <div
                  key={id}
                  className={`flex items-center justify-between px-5 py-4 ${
                    idx < arr.length - 1 ? 'border-b border-stone-100' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-medium text-stone-800 truncate">{info.name}</span>
                    <span className="shrink-0 text-[9px] font-medium uppercase tracking-wider bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded">
                      User Uploaded
                    </span>
                  </div>
                  <span className="font-mono text-xs font-semibold text-stone-600 tabular-nums">
                    {info.count.toLocaleString()} <span className="font-normal text-[10px] text-stone-400">questions</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Active Papers ──────────────────────────────────────────────── */}
        {activePapers.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-4">
              Recent Papers in Session
            </p>
            <div className="bg-[#faf9f7] rounded-xl border border-stone-200 overflow-hidden shadow-sm">
              {activePapers.map((p, idx, arr) => {
                const marks = p.items.reduce((s, i) => s + i.marks, 0)
                return (
                  <button
                    key={p.id}
                    onClick={() => onOpenPaper(p.id)}
                    className={`w-full flex items-center justify-between px-5 py-4 text-left hover:bg-stone-50 transition-colors focus:outline-none ${
                      idx < arr.length - 1 ? 'border-b border-stone-100' : ''
                    }`}
                  >
                    <span className="text-xs font-medium text-stone-800">{p.title}</span>
                    <span className="text-[11px] text-stone-400 font-mono">
                      {p.items.length} questions · {marks} marks
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
