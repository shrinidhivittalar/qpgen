import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchSubjects, fetchQuestions, fetchUploads, rephraseQuestion, uploadPaper, confirmUpload, renameUpload } from './api'
import { QuestionBank } from './components/QuestionBank'
import { PaperBuilder } from './components/PaperBuilder'
import { UploadReviewModal } from './components/UploadReviewModal'
import type { BankQuestion, PaperItem, PaperTab, RawQuestion } from './types'
import { MARKS_DEFAULT } from './types'
import { cleanText, jaccardSimilarity } from './utils'

export type ExportCol = 'num' | 'question' | 'marks' | 'source'

const mkUid   = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const newTab  = (title = 'New Paper'): PaperTab => ({ id: mkUid(), title, items: [] })

type BankCache = Record<string, BankQuestion[]>

export default function App() {
  // ── Subject / source selection ─────────────────────────────────────────
  const [subjectMap, setSubjectMap]   = useState<Record<string, Record<string, number>>>({})
  const [subject, setSubject]         = useState('science')
  const [source, setSource]           = useState('qp')

  // ── Question bank cache ───────────────────────────────────────────────
  const [bankCache, setBankCache]     = useState<BankCache>({})
  const [loading, setLoading]         = useState(false)

  // ── Search / filter ───────────────────────────────────────────────────
  const [search, setSearch]           = useState('')
  const [typeFilter, setTypeFilter]   = useState('all')

  // ── Multi-paper state ─────────────────────────────────────────────────
  const [papers, setPapers]           = useState<PaperTab[]>([newTab('Model Question Paper')])
  const [activeId, setActiveId]       = useState(() => papers[0].id)
  const [rephrasing, setRephrasing]   = useState<string | null>(null)

  // ── Upload state ──────────────────────────────────────────────────────
  const [uploading, setUploading]     = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saving, setSaving]           = useState(false)
  const [uploadPreview, setUploadPreview] = useState<{
    name: string; raw: RawQuestion[]; warnings: string[]
  } | null>(null)
  // id -> { name, count }
  const [uploadedSources, setUploadedSources] =
    useState<Record<string, { name: string; count: number }>>({})
  // subject -> { uploadId -> customName }  (after merge into existing subject)
  const [mergedSources, setMergedSources] =
    useState<Record<string, Record<string, string>>>({})
  // pending merge dialog
  const [mergeDialog, setMergeDialog] =
    useState<{ id: string; name: string; target: string } | null>(null)

  // ── Export ────────────────────────────────────────────────────────────
  const [exportCols, setExportCols]   = useState<Set<ExportCol>>(
    new Set(['num', 'question', 'marks', 'source'])
  )

  // ── Derived ───────────────────────────────────────────────────────────
  const activePaper   = papers.find(p => p.id === activeId) ?? papers[0]
  const paper         = activePaper.items
  const paperTitle    = activePaper.title
  const lockedSubject = paper.find(i => i.subject !== 'custom')?.subject ?? null
  const bankKey       = `${subject}/${source}`
  const bankQuestions = bankCache[bankKey] ?? []

  // ── Load subject map on mount ─────────────────────────────────────────
  useEffect(() => {
    // Load static subjects + persisted uploads in parallel
    Promise.all([fetchSubjects(), fetchUploads()])
      .then(([map, uploads]) => {
        const { uploaded: _ignored, ...staticMap } = map
        setSubjectMap(staticMap)
        const firstSubj = Object.keys(staticMap)[0]
        if (firstSubj) {
          setSubject(firstSubj)
          setSource(Object.keys(staticMap[firstSubj])[0] ?? 'qp')
        }
        // Restore persisted uploads into client state (questions lazy-loaded on demand)
        if (uploads.length > 0) {
          setUploadedSources(
            Object.fromEntries(uploads.map(u => [u.id, { name: u.name, count: u.count }]))
          )
        }
      })
      .catch(console.error)
  }, [])

  // ── Load questions when subject/source changes ────────────────────────
  useEffect(() => {
    if (bankCache[bankKey]) return   // already in cache
    setLoading(true)
    const key = bankKey  // capture at effect run time
    fetchQuestions(subject, source)
      .then(qs => setBankCache(prev => ({ ...prev, [key]: qs })))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [bankKey, subject, source])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effective subject map ─────────────────────────────────────────────
  // Static subjects + merged upload sources as extra source tabs per subject.
  // Uploaded papers are NOT included here; they appear in the dropdown directly.
  const effectiveSubjectMap = useMemo(() => {
    const result: Record<string, Record<string, number>> = {}
    for (const [subj, srcs] of Object.entries(subjectMap)) {
      result[subj] = { ...srcs }
    }
    for (const [target, srcs] of Object.entries(mergedSources)) {
      if (result[target]) {
        for (const [id] of Object.entries(srcs)) {
          result[target][id] = bankCache[`${target}/${id}`]?.length ?? 0
        }
      }
    }
    return result
  }, [subjectMap, mergedSources, bankCache])

  // Maps any source ID (upload or merged) to its custom display name
  const sourceLabels = useMemo(() => {
    const labels: Record<string, string> = {}
    for (const [id, info] of Object.entries(uploadedSources)) labels[id] = info.name
    for (const srcs of Object.values(mergedSources)) {
      for (const [id, name] of Object.entries(srcs)) labels[id] = name
    }
    return labels
  }, [uploadedSources, mergedSources])

  // ── setSubject handler (handles __up__<id> virtual keys) ─────────────
  const handleSelectSubject = useCallback((val: string) => {
    if (val.startsWith('__up__')) {
      const id = val.slice(6)
      setSubject('uploaded')
      setSource(id)
    } else {
      setSubject(val)
      setSource(Object.keys(effectiveSubjectMap[val] ?? {})[0] ?? 'qp')
    }
  }, [effectiveSubjectMap])

  // ── Helpers that mutate only active paper ─────────────────────────────
  const setItems = useCallback((updater: (prev: PaperItem[]) => PaperItem[]) => {
    setPapers(prev => prev.map(p =>
      p.id === activeId ? { ...p, items: updater(p.items) } : p
    ))
  }, [activeId])

  const setTitle = useCallback((title: string) => {
    setPapers(prev => prev.map(p => p.id === activeId ? { ...p, title } : p))
  }, [activeId])

  // ── Paper tab management ──────────────────────────────────────────────
  const handleNewPaper = useCallback(() => {
    const tab = newTab()
    setPapers(prev => [...prev, tab])
    setActiveId(tab.id)
  }, [])

  const handleSwitchPaper = useCallback((id: string) => setActiveId(id), [])

  const handleRenameTab = useCallback((id: string, title: string) => {
    setPapers(prev => prev.map(p => p.id === id ? { ...p, title } : p))
  }, [])

  const handleCloseTab = useCallback((id: string) => {
    setPapers(prev => {
      if (prev.length === 1) return prev
      const idx  = prev.findIndex(p => p.id === id)
      const next = prev.filter(p => p.id !== id)
      setActiveId(cur => cur === id ? next[Math.max(0, idx - 1)].id : cur)
      return next
    })
  }, [])

  // ── Question handlers ─────────────────────────────────────────────────
  const paperQids = new Set(paper.map(i => `${i.subject}:${i.source}:${i.qid}`))

  const handleToggle = useCallback((q: BankQuestion) => {
    const key = `${subject}:${source}:${q.qid}`
    if (paperQids.has(key)) {
      setItems(prev => prev.filter(i => !(i.subject === subject && i.source === source && i.qid === q.qid)))
    } else {
      const item: PaperItem = {
        ...q,
        uid:          mkUid(),
        subject,
        marks:        MARKS_DEFAULT[q.type] ?? 2,
        isRephrased:  false,
        originalText: q.text,
      }
      setItems(prev => [...prev, item])
    }
  }, [subject, source, paperQids, setItems])

  const handleRemove      = useCallback((uid: string) => setItems(p => p.filter(i => i.uid !== uid)), [setItems])
  const handleMarksChange = useCallback((uid: string, marks: number) =>
    setItems(p => p.map(i => i.uid === uid ? { ...i, marks } : i)), [setItems])

  const handleTextChange  = useCallback((uid: string, newText: string) =>
    setItems(p => p.map(i => i.uid === uid
      ? { ...i, text: newText, ...(!i.isRephrased ? { originalText: newText } : {}) }
      : i
    )), [setItems])

  const handleUndoRephrase = useCallback((uid: string) =>
    setItems(p => p.map(i => i.uid === uid
      ? { ...i, text: i.originalText, isRephrased: false } : i
    )), [setItems])

  const handleRephrase = useCallback(async (uid: string) => {
    const item = paper.find(i => i.uid === uid)
    if (!item) return
    setRephrasing(uid)
    try {
      const rephrased = await rephraseQuestion(cleanText(item.text), item.type)
      setItems(p => p.map(i => i.uid === uid ? { ...i, text: rephrased, isRephrased: true } : i))
    } catch {
      alert('Rephrase failed. Check the server is running.')
    } finally {
      setRephrasing(null)
    }
  }, [paper, setItems])

  const handleAddCustom = useCallback((text: string) => {
    setItems(prev => [...prev, {
      uid:          mkUid(),
      qid:          `CUSTOM-${mkUid()}`,
      number:       0,
      subject:      'custom',
      source:       'custom',
      chapter:      null,
      chapter_num:  null,
      section:      null,
      text,
      originalText: text,
      type:         'custom',
      has_figure:   false,
      has_table:    false,
      images:       [],
      tables:       [],
      marks:        2,
      isRephrased:  false,
    }])
  }, [setItems])

  const handleReorder = useCallback((items: PaperItem[]) => setItems(() => items), [setItems])

  // ── Upload rename with merge detection ────────────────────────────────
  const handleRenameUpload = useCallback((id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const collision = Object.keys(subjectMap).find(
      k => k.toLowerCase() === trimmed.toLowerCase()
    )
    if (collision) {
      setMergeDialog({ id, name: trimmed, target: collision })
    } else {
      setUploadedSources(prev => ({ ...prev, [id]: { ...prev[id], name: trimmed } }))
      renameUpload(id, trimmed).catch(console.error)  // persist to MongoDB
    }
  }, [subjectMap])

  // Confirm / cancel the merge dialog
  const handleMerge = useCallback((confirmed: boolean) => {
    if (confirmed && mergeDialog) {
      const { id, name, target } = mergeDialog
      const questions = bankCache[`uploaded/${id}`] ?? []
      // Move cache to new key under the target subject
      setBankCache(prev => {
        const next = { ...prev, [`${target}/${id}`]: questions }
        delete next[`uploaded/${id}`]
        return next
      })
      // Register as a merged source under the target subject
      setMergedSources(prev => ({
        ...prev,
        [target]: { ...(prev[target] ?? {}), [id]: name },
      }))
      // Remove from standalone uploads
      setUploadedSources(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      // Switch view to the merged subject + source
      setSubject(target)
      setSource(id)
    }
    setMergeDialog(null)
  }, [mergeDialog, bankCache])

  // ── Upload handler — parse only, open review modal ───────────────────
  const handleUpload = useCallback(async (file: File, paperType: string) => {
    setUploading(true)
    setUploadError(null)
    try {
      const result = await uploadPaper(file, paperType)
      setUploadPreview(result)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [])

  // ── Confirm handler — save reviewed questions to DB ───────────────────
  const handleConfirmUpload = useCallback(async (name: string, questions: RawQuestion[]) => {
    setSaving(true)
    setUploadError(null)
    try {
      const result = await confirmUpload(name, questions)
      // Don't pre-populate bankCache here — let the useEffect fetch naturally
      // after subject/source change. This avoids stale-closure timing issues.
      setUploadedSources(prev => ({
        ...prev,
        [result.id]: { name: result.name, count: result.count },
      }))
      setUploadPreview(null)
      setSubject('uploaded')
      setSource(result.id)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Save failed')
      setUploadPreview(null)
    } finally {
      setSaving(false)
    }
  }, [])

  // ── Similarity maps ───────────────────────────────────────────────────
  const similarityMap = useMemo(() => {
    const result: Record<string, number> = {}
    if (!paper.length) return result
    for (const q of bankQuestions) {
      const qWords = cleanText(q.text)
      let best = 0
      for (const item of paper) {
        const sim = jaccardSimilarity(qWords, cleanText(item.text))
        if (sim > best) best = sim
      }
      if (best > 0.35) result[q.qid] = best
    }
    return result
  }, [bankQuestions, paper])

  const crossSourceMap = useMemo(() => {
    const paperFromOtherSrc = paper.filter(
      i => i.source !== source && i.subject === subject
    )
    if (!paperFromOtherSrc.length) return {}
    const result: Record<string, { sim: number; src: string }> = {}
    for (const q of bankQuestions) {
      const qWords = cleanText(q.text)
      let best = 0; let bestSrc = ''
      for (const item of paperFromOtherSrc) {
        const sim = jaccardSimilarity(qWords, cleanText(item.text))
        if (sim > best) { best = sim; bestSrc = item.source }
      }
      if (best > 0.4) result[q.qid] = { sim: best, src: bestSrc }
    }
    return result
  }, [bankQuestions, paper, source, subject])

  // ── Export ────────────────────────────────────────────────────────────
  const handleToggleExportCol = useCallback((col: ExportCol) => {
    setExportCols(prev => {
      const next = new Set(prev)
      next.has(col) ? next.delete(col) : next.add(col)
      return next
    })
  }, [])

  const handleExport = useCallback(() => {
    const win = window.open('', '_blank')
    if (!win) return
    const totalMarks = paper.reduce((s, i) => s + i.marks, 0)
    const apiBase    = 'http://localhost:5050'
    const cols       = exportCols

    const thCells = [
      cols.has('num')      && '<th>#</th>',
      cols.has('question') && '<th>Question</th>',
      cols.has('marks')    && '<th>Marks</th>',
      cols.has('source')   && '<th>Source</th>',
    ].filter(Boolean).join('')

    const rows = paper.map((item, idx) => {
      const srcLabel = sourceLabels[item.source] ?? item.source
      const qLabel   = item.type === 'custom'
        ? 'Custom'
        : `Q${item.number} (${item.subject} / ${srcLabel})`
      const imgs = item.images.map(img =>
        `<img src="${apiBase}/api/images/${item.subject}/${item.source}/${img.file}"
              style="max-width:320px;height:auto;display:block;margin-top:8px;border:1px solid #ddd;padding:4px"/>`
      ).join('')
      const tdCells = [
        cols.has('num')      && `<td>${idx + 1}</td>`,
        cols.has('question') && `<td style="white-space:pre-wrap">${cleanText(item.text)}${imgs}</td>`,
        cols.has('marks')    && `<td>${item.marks}</td>`,
        cols.has('source')   && `<td><span style="font-size:11px;color:#555">${qLabel}</span></td>`,
      ].filter(Boolean).join('')
      return `<tr>${tdCells}</tr>`
    }).join('')

    win.document.write(`<!doctype html><html><head>
      <title>${paperTitle}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:32px;color:#111}
        h1{font-size:20px;text-align:center;margin-bottom:4px}
        p.meta{text-align:center;color:#555;margin-bottom:24px}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #ccc;padding:8px 10px;vertical-align:top;text-align:left}
        th{background:#f5f5f5}
        @media print{body{padding:16px}}
      </style></head><body>
      <h1>${paperTitle}</h1>
      <p class="meta">Total Marks: ${totalMarks} &nbsp;|&nbsp; Questions: ${paper.length}</p>
      <table>
        <thead><tr>${thCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)
  }, [paper, paperTitle, exportCols, sourceLabels])

  // ── Filtered bank ─────────────────────────────────────────────────────
  const visibleQuestions = bankQuestions.filter(q => {
    const matchType   = typeFilter === 'all' || q.type === typeFilter
    const matchSearch = !search || q.text.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  const totalMarks = paper.reduce((s, i) => s + i.marks, 0)

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="flex items-center justify-between px-6 py-3 bg-indigo-700 text-white shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight">QP Builder</span>
          <span className="text-indigo-300 text-sm">MVP</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-indigo-200">
            {paper.length} question{paper.length !== 1 ? 's' : ''} · {totalMarks} marks
          </span>
          <button
            onClick={handleExport}
            disabled={paper.length === 0}
            className="px-4 py-1.5 bg-white text-indigo-700 rounded-md text-sm font-medium
                       hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Export / Print
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <QuestionBank
          subjectMap={effectiveSubjectMap}
          uploadedSources={uploadedSources}
          sourceLabels={sourceLabels}
          subject={subject}
          setSubject={handleSelectSubject}
          source={source}
          setSource={setSource}
          lockedSubject={lockedSubject}
          onNewPaper={handleNewPaper}
          questions={visibleQuestions}
          allQuestions={bankQuestions}
          search={search}
          setSearch={setSearch}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          paperQids={paperQids}
          onToggle={handleToggle}
          loading={loading}
          uploading={uploading}
          uploadError={uploadError}
          onUpload={handleUpload}
          onRenameUpload={handleRenameUpload}
          similarityMap={similarityMap}
          crossSourceMap={crossSourceMap}
        />
        <PaperBuilder
          papers={papers}
          activeId={activeId}
          paper={paper}
          paperTitle={paperTitle}
          setPaperTitle={setTitle}
          rephrasing={rephrasing}
          exportCols={exportCols}
          onToggleExportCol={handleToggleExportCol}
          onSwitchPaper={handleSwitchPaper}
          onNewPaper={handleNewPaper}
          onCloseTab={handleCloseTab}
          onRenameTab={handleRenameTab}
          onRemove={handleRemove}
          onRephrase={handleRephrase}
          onUndoRephrase={handleUndoRephrase}
          onMarksChange={handleMarksChange}
          onTextChange={handleTextChange}
          onAddCustom={handleAddCustom}
          onReorder={handleReorder}
          onExport={handleExport}
        />
      </div>

      {/* ── Upload review modal ──────────────────────────────────────────── */}
      {uploadPreview && (
        <UploadReviewModal
          name={uploadPreview.name}
          questions={uploadPreview.raw}
          warnings={uploadPreview.warnings}
          saving={saving}
          onConfirm={handleConfirmUpload}
          onCancel={() => setUploadPreview(null)}
        />
      )}

      {/* ── Merge confirmation dialog ──────────────────────────────────── */}
      {mergeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Merge into existing subject?</h2>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm text-gray-700">
              <p>
                The name <span className="font-semibold">"{mergeDialog.name}"</span> matches
                the existing subject <span className="font-semibold capitalize">{mergeDialog.target}</span>.
              </p>
              <p>
                Merging will add these uploaded questions as a new source tab inside{' '}
                <span className="capitalize font-medium">{mergeDialog.target}</span>.
                Questions similar to existing ones will be flagged automatically.
              </p>
              <p className="text-gray-500 text-xs">
                If you want to keep them separate, click Cancel and choose a different name.
              </p>
            </div>
            <div className="px-6 py-4 flex justify-end gap-3 bg-gray-50">
              <button
                onClick={() => handleMerge(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300
                           text-gray-700 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMerge(true)}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white
                           font-medium hover:bg-indigo-700 transition"
              >
                Merge into {mergeDialog.target}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
