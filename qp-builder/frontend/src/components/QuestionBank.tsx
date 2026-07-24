import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { TYPE_LABELS, TYPE_COLORS } from '../types'
import type { BankQuestion, QuestionType } from '../types'
import type { User } from '../api'
import { BankCard } from './BankCard'

type SortBy = 'number' | 'type'

const TYPE_SORT_ORDER: Record<string, number> = {
  mcq: 0, text: 1, figure_based: 2, table_based: 3, multi_part: 4,
  analogy: 5, grammar: 6, comprehension: 7, essay: 8, letter: 9,
}

const ALL_TYPES: QuestionType[] = [
  'mcq', 'text', 'figure_based', 'table_based', 'multi_part',
  'analogy', 'grammar', 'comprehension', 'essay', 'letter',
]

const STATIC_SOURCE_LABELS: Record<string, string> = {
  qp:               'Question Paper',
  textbook:         'Textbook',
  yashassu_science: 'Yashassu Science',
  yashassu_maths:   'Yashassu Maths',
  yashassu_english: 'Yashassu English',
}

interface Props {
  subjectMap:      Record<string, Record<string, number>>
  uploadedSources: Record<string, { name: string; count: number }>
  sourceLabels:    Record<string, string>
  subject:         string
  setSubject:      (val: string) => void
  source:          string
  setSource:       (s: string) => void
  lockedSubject:   string | null
  onNewPaper:      () => void
  questions:       BankQuestion[]
  allQuestions:    BankQuestion[]
  search:          string
  setSearch:       (s: string) => void
  typeFilter:      string
  setTypeFilter:   (t: string) => void
  paperQids:       Set<string>
  onToggle:        (q: BankQuestion) => void
  loading:              boolean
  bankError:            string | null
  uploading:            boolean
  uploadError:          string | null
  onUpload:             (file: File, paperType: string) => void
  onRenameUpload:       (id: string, name: string) => void
  onDeleteSource:       (subject: string, source: string) => void
  onDeleteBankQuestion: (qid: string) => void
  onEditBankQuestion:   (qid: string, text: string, type: QuestionType) => void
  similarityMap:        Record<string, number>
  crossSourceMap:       Record<string, { sim: number; src: string }>
  user:                 User
}

export function QuestionBank({
  subjectMap, uploadedSources, sourceLabels,
  subject, setSubject, source, setSource,
  lockedSubject, onNewPaper,
  questions, allQuestions, search, setSearch, typeFilter, setTypeFilter,
  paperQids, onToggle, loading, bankError,
  uploading, uploadError, onUpload, onRenameUpload, onDeleteSource,
  onDeleteBankQuestion, onEditBankQuestion,
  similarityMap, crossSourceMap,
  user,
}: Props) {
  const fileInputRef    = useRef<HTMLInputElement>(null)
  const renameInputRef  = useRef<HTMLInputElement>(null)
  const [paperType, setPaperType] = useState('sslc_qp')

  const [renamingUpload, setRenamingUpload] = useState(false)
  const [renameDraft,    setRenameDraft]    = useState('')

  const startRename = useCallback(() => {
    const current = uploadedSources[source]?.name ?? source
    setRenameDraft(current)
    setRenamingUpload(true)
  }, [uploadedSources, source])

  const commitRename = useCallback(() => {
    const trimmed = renameDraft.trim()
    if (trimmed && trimmed !== (uploadedSources[source]?.name ?? source)) {
      onRenameUpload(source, trimmed)
    }
    setRenamingUpload(false)
  }, [renameDraft, source, uploadedSources, onRenameUpload])

  const staticSubjects = Object.keys(subjectMap)
  const uploadEntries  = Object.entries(uploadedSources)

  let dropdownValue = subject
  if (subject === 'uploaded') {
    dropdownValue = `__up__${source}`
  }

  const handleSelectSubject = useCallback((val: string) => {
    if (val.startsWith('__up__')) {
      const uploadId = val.replace('__up__', '')
      setSubject('uploaded')
      setSource(uploadId)
    } else {
      setSubject(val)
      const firstSrc = Object.keys(subjectMap[val] ?? {})[0] ?? 'qp'
      setSource(firstSrc)
    }
  }, [subjectMap, setSubject, setSource])

  const isUploaded = subject === 'uploaded'
  const sources = Object.keys(subjectMap[subject] ?? {})

  const [sortBy, setSortBy] = useState<SortBy>('number')
  useEffect(() => { setSortBy('number') }, [source, subject])

  const visibleQuestions = useMemo(() => {
    if (sortBy === 'type') {
      return [...questions].sort(
        (a, b) => (TYPE_SORT_ORDER[a.type] ?? 5) - (TYPE_SORT_ORDER[b.type] ?? 5)
      )
    }
    return [...questions].sort((a, b) => a.number - b.number)
  }, [questions, sortBy])

  const allowedTypes = useMemo(() => {
    const inBank = new Set(allQuestions.map(q => q.type))
    return ALL_TYPES.filter(t => inBank.has(t))
  }, [allQuestions])

  const typeCounts = useMemo(() => Object.fromEntries(
    allowedTypes.map(t => [t, allQuestions.filter(q => q.type === t).length])
  ), [allQuestions, allowedTypes])

  const isLocked = !!lockedSubject && lockedSubject !== subject

  const srcLabel = (src: string) =>
    sourceLabels[src] ?? STATIC_SOURCE_LABELS[src] ?? src

  // RBAC checks
  const isViewer = user.role === 'Viewer'
  const canRename = isUploaded && (user.role === 'Admin' || user.role === 'Teacher')
  const canDeleteSource = isUploaded
    ? (user.role === 'Admin' || user.role === 'Teacher')
    : (user.role === 'Admin') // static subjects delete-able by Admin only

  return (
    <aside className="flex flex-col w-2/5 border-r border-stone-200 bg-[#faf9f7] overflow-hidden">

      {/* ── Subject dropdown ──────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-0 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <label className="text-[10px] font-semibold text-stone-400 whitespace-nowrap uppercase tracking-wider">Subject</label>

          <select
            value={dropdownValue}
            onChange={e => handleSelectSubject(e.target.value)}
            className="flex-1 px-2.5 py-1.5 text-xs border border-stone-200 rounded-md bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-900 capitalize"
          >
            {staticSubjects.map(s => (
              <option key={s} value={s} className="capitalize">
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}

            {uploadEntries.map(([id, info]) => (
              <option key={`__up__${id}`} value={`__up__${id}`}>
                {info.name}
              </option>
            ))}
          </select>

          {/* Rename button */}
          {canRename && !renamingUpload && (
            <button
              onClick={startRename}
              className="shrink-0 px-2.5 py-1.5 text-[11px] rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Rename
            </button>
          )}

          {/* Delete button */}
          {canDeleteSource && !renamingUpload && (
            <button
              onClick={() => {
                const label = isUploaded
                  ? 'this uploaded paper and all its questions'
                  : `all ${subject} / ${srcLabel(source)} questions`
                if (window.confirm(`Delete ${label}? This cannot be undone.`)) {
                  onDeleteSource(subject, source)
                }
              }}
              className="shrink-0 px-2.5 py-1.5 text-[11px] rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors font-medium"
            >
              Delete
            </button>
          )}
        </div>

        {/* Inline rename field (shown when renaming an upload) */}
        {isUploaded && renamingUpload && (
          <div className="flex items-center gap-2 mb-3">
            <input
              ref={renameInputRef}
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenamingUpload(false)
              }}
              placeholder="New name..."
              className="flex-1 px-3 py-1.5 text-xs border border-stone-900 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-900"
              autoFocus
            />
            <button
              onClick={commitRename}
              className="shrink-0 px-3 py-1.5 text-xs rounded-md bg-stone-900 text-white hover:opacity-95 transition"
            >
              Save
            </button>
            <button
              onClick={() => setRenamingUpload(false)}
              className="shrink-0 text-zinc-400 hover:text-zinc-600 text-xs px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Source tabs — only for non-uploaded subjects */}
        {!isUploaded && sources.length > 1 && (
          <div className="flex border-b border-stone-200 overflow-x-auto gap-2">
            {sources.map(src => (
              <button
                key={src}
                onClick={() => setSource(src)}
                className={`shrink-0 py-2 px-1 text-xs font-medium transition-all whitespace-nowrap relative
                  ${source === src
                    ? 'text-stone-900 font-semibold border-b-2 border-stone-900'
                    : 'text-stone-400 hover:text-stone-600'
                  }`}
              >
                {srcLabel(src)}
                <span className="ml-1 text-[10px] text-zinc-400">
                  ({subjectMap[subject]?.[src] ?? 0})
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Lock banner ─────────────────────────────────────────────────── */}
      {isLocked && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 shrink-0">
          <p className="font-semibold mb-1">
            Paper is locked to <span className="capitalize">{lockedSubject}</span>
          </p>
          <p className="mb-2 text-amber-700">
            Remove all <span className="capitalize font-medium">{lockedSubject}</span> questions
            first, or open a separate paper editor.
          </p>
          <button
            onClick={onNewPaper}
            className="px-3 py-1 rounded-md bg-amber-600 text-white font-medium hover:bg-amber-700 transition"
          >
            + New paper
          </button>
        </div>
      )}

      {/* ── Search + Sort ────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2 shrink-0 flex gap-2">
        <input
          type="text"
          placeholder={
            isUploaded
              ? `Search "${uploadedSources[source]?.name ?? 'uploaded'}" questions...`
              : `Search ${srcLabel(source)}...`
          }
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-900 placeholder-stone-400"
        />
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortBy)}
          title="Sort questions"
          className="shrink-0 px-2 py-1.5 text-[11px] border border-stone-200 rounded-lg bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-900"
        >
          <option value="number">No. ↑</option>
          <option value="type">Type</option>
        </select>
      </div>

      {/* ── Type filter pills ────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3 shrink-0">
        <button
          onClick={() => setTypeFilter('all')}
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition
            ${typeFilter === 'all'
              ? 'bg-stone-900 text-white'
              : 'bg-stone-100 text-stone-600 hover:opacity-85'
            }`}
        >
          All ({allQuestions.length})
        </button>
        {allowedTypes.filter(t => typeCounts[t] > 0).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition
              ${typeFilter === t
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-600 hover:opacity-85'
              }`}
          >
            {TYPE_LABELS[t]} ({typeCounts[t]})
          </button>
        ))}
      </div>

      {/* ── Question list ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-zinc-400 text-xs">
            Loading questions...
          </div>
        ) : bankError ? (
          <div className="mx-1 mt-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-750">
            {bankError}
          </div>
        ) : visibleQuestions.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-zinc-400 text-xs">
            No questions match.
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleQuestions.map(q => (
              <BankCard
                key={q.qid}
                question={q}
                subject={subject}
                source={source}
                sourceLabels={sourceLabels}
                added={paperQids.has(`${subject}:${source}:${q.qid}`)}
                locked={isLocked}
                readOnly={isViewer}
                paperSimilarity={similarityMap[q.qid] ?? 0}
                crossSimilarity={crossSourceMap[q.qid] ?? null}
                onToggle={() => onToggle(q)}
                onDeleteQuestion={isUploaded && !isViewer ? () => onDeleteBankQuestion(q.qid) : undefined}
                onEditQuestion={isUploaded && !isViewer ? (text, type) => onEditBankQuestion(q.qid, text, type) : undefined}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
