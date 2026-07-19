import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { PaperCard } from './PaperCard'
import type { PaperItem, PaperTab } from '../types'
import type { ExportCol } from '../App'

const COL_OPTIONS: { key: ExportCol; label: string }[] = [
  { key: 'num',      label: '#' },
  { key: 'question', label: 'Question' },
  { key: 'marks',    label: 'Marks' },
  { key: 'source',   label: 'Source' },
]

interface Props {
  papers:              PaperTab[]
  activeId:            string
  paper:               PaperItem[]
  paperTitle:          string
  setPaperTitle:       (t: string) => void
  rephrasing:          string | null
  exportCols:          Set<ExportCol>
  onToggleExportCol:   (col: ExportCol) => void
  onSwitchPaper:       (id: string) => void
  onNewPaper:          () => void
  onCloseTab:          (id: string) => void
  onRenameTab:         (id: string, title: string) => void
  onRemove:            (uid: string) => void
  onRephrase:          (uid: string) => void
  onUndoRephrase:      (uid: string) => void
  onMarksChange:       (uid: string, marks: number) => void
  onTextChange:        (uid: string, text: string) => void
  onAddCustom:         (text: string) => void
  onReorder:           (paper: PaperItem[]) => void
  onExport:            () => void
}

export function PaperBuilder({
  papers, activeId, paper, paperTitle, setPaperTitle, rephrasing,
  exportCols, onToggleExportCol,
  onSwitchPaper, onNewPaper, onCloseTab, onRenameTab,
  onRemove, onRephrase, onUndoRephrase, onMarksChange, onTextChange,
  onAddCustom, onReorder, onExport,
}: Props) {
  const [customText, setCustomText]         = useState('')
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [showColPicker, setShowColPicker]   = useState(false)
  const [editingTabId, setEditingTabId]     = useState<string | null>(null)
  const [tabDraft, setTabDraft]             = useState('')

  function startRenameTab(id: string, currentTitle: string, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingTabId(id)
    setTabDraft(currentTitle)
  }

  function commitRename(id: string) {
    const trimmed = tabDraft.trim()
    if (trimmed) onRenameTab(id, trimmed)
    setEditingTabId(null)
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = paper.findIndex(i => i.uid === active.id)
    const newIdx = paper.findIndex(i => i.uid === over.id)
    onReorder(arrayMove(paper, oldIdx, newIdx))
  }

  function submitCustom() {
    if (!customText.trim()) return
    onAddCustom(customText.trim())
    setCustomText('')
    setShowCustomForm(false)
  }

  const totalMarks = paper.reduce((s, i) => s + i.marks, 0)

  return (
    <main className="flex flex-col flex-1 overflow-hidden bg-gray-50">

      {/* ── Paper tabs ──────────────────────────────────────────────────── */}
      <div className="flex items-end gap-0 px-3 pt-2 bg-white border-b border-gray-200 shrink-0 overflow-x-auto">
        {papers.map(p => (
          <div
            key={p.id}
            onClick={() => onSwitchPaper(p.id)}
            className={`group flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md
                        cursor-pointer select-none border border-b-0 mr-1 transition whitespace-nowrap
              ${p.id === activeId
                ? 'bg-gray-50 border-gray-200 text-indigo-600'
                : 'bg-gray-100 border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
          >
            {editingTabId === p.id ? (
              <input
                autoFocus
                className="max-w-[120px] bg-white border border-indigo-400 rounded px-1
                           text-xs text-gray-800 outline-none"
                value={tabDraft}
                onChange={e => setTabDraft(e.target.value)}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename(p.id)
                  if (e.key === 'Escape') setEditingTabId(null)
                }}
                onBlur={() => commitRename(p.id)}
              />
            ) : (
              <span
                className="max-w-[120px] truncate"
                onDoubleClick={e => startRenameTab(p.id, p.title, e)}
                title="Double-click to rename"
              >
                {p.title}
              </span>
            )}
            {p.items.length > 0 && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5
                ${p.id === activeId ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-500'}`}>
                {p.items.length}
              </span>
            )}
            {papers.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); onCloseTab(p.id) }}
                className="ml-0.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500
                           leading-none transition rounded-full w-4 h-4 flex items-center justify-center"
                title="Close paper"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          onClick={onNewPaper}
          className="px-2.5 py-2 text-xs text-gray-400 hover:text-indigo-600 transition mb-0 self-end"
          title="New paper"
        >
          + New
        </button>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <input
            type="text"
            value={paperTitle}
            onChange={e => setPaperTitle(e.target.value)}
            className="flex-1 max-w-xs text-sm font-medium text-gray-700 bg-transparent border-b border-transparent
                       hover:border-gray-300 focus:border-indigo-500 focus:outline-none px-1 transition"
          />
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {paper.length} questions · {totalMarks} marks
          </span>
        </div>
        <div className="flex items-center gap-2 ml-3 relative">
          <button
            onClick={() => setShowCustomForm(v => !v)}
            className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-600
                       hover:bg-gray-50 transition"
          >
            + Custom
          </button>

          {/* Columns picker */}
          <div className="relative">
            <button
              onClick={() => setShowColPicker(v => !v)}
              className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-600
                         hover:bg-gray-50 transition"
            >
              Columns ({exportCols.size})
            </button>
            {showColPicker && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200
                              rounded-lg shadow-lg p-3 min-w-[140px]">
                <p className="text-xs font-semibold text-gray-500 mb-2">Export columns</p>
                {COL_OPTIONS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportCols.has(key)}
                      onChange={() => onToggleExportCol(key)}
                      className="accent-indigo-600"
                    />
                    <span className="text-xs text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => { setShowColPicker(false); onExport() }}
            disabled={paper.length === 0}
            className="px-3 py-1.5 text-xs rounded-md bg-indigo-600 text-white
                       hover:bg-indigo-700 disabled:opacity-40 transition"
          >
            Export
          </button>
        </div>
      </div>

      {/* Custom question form */}
      {showCustomForm && (
        <div className="px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <textarea
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md resize-none
                       focus:outline-none focus:ring-2 focus:ring-indigo-400"
            rows={3}
            placeholder="Type your custom question here..."
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submitCustom() }}
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={submitCustom}
              disabled={!customText.trim()}
              className="px-3 py-1.5 text-xs rounded-md bg-green-600 text-white
                         hover:bg-green-700 disabled:opacity-40 transition"
            >
              Add Question
            </button>
            <button
              onClick={() => { setShowCustomForm(false); setCustomText('') }}
              className="px-3 py-1.5 text-xs rounded-md bg-gray-100 text-gray-600
                         hover:bg-gray-200 transition"
            >
              Cancel
            </button>
            <span className="text-xs text-gray-400 self-center ml-1">Ctrl+Enter to add</span>
          </div>
        </div>
      )}

      {/* Paper list */}
      <div className="flex-1 overflow-y-auto px-4 py-3" onClick={() => setShowColPicker(false)}>
        {paper.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2">
            <p className="text-4xl">📋</p>
            <p>This paper is empty.</p>
            <p className="text-xs">Click + on questions from the bank to add them here.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={paper.map(i => i.uid)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-2">
                {paper.map((item, idx) => (
                  <PaperCard
                    key={item.uid}
                    item={item}
                    index={idx}
                    rephrasing={rephrasing}
                    onRemove={onRemove}
                    onRephrase={onRephrase}
                    onUndoRephrase={onUndoRephrase}
                    onMarksChange={onMarksChange}
                    onTextChange={onTextChange}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </main>
  )
}
