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
import type { PaperItem, PaperSection, PaperTab } from '../types'
import type { User } from '../api'
import { mkUid } from '../utils'

interface Props {
  papers:               PaperTab[]
  activeId:             string
  paper:                PaperItem[]
  paperTitle:           string
  setPaperTitle:        (t: string) => void
  rephrasing:           string | null
  sections:             PaperSection[]
  activeSectionId:      string | null
  onActiveSectionChange:(id: string | null) => void
  onAddSection:         (sec: PaperSection) => void
  onUpdateSection:      (id: string, updates: Partial<PaperSection>) => void
  onDeleteSection:      (id: string) => void
  onMoveToSection:      (uid: string, sectionId: string | null) => void
  onSwitchPaper:        (id: string) => void
  onNewPaper:           () => void
  onCloseTab:           (id: string) => void
  onRenameTab:          (id: string, title: string) => void
  onRemove:             (uid: string) => void
  onRephrase:           (uid: string) => void
  onUndoRephrase:       (uid: string) => void
  onMarksChange:        (uid: string, marks: number) => void
  onTextChange:         (uid: string, text: string) => void
  onAddCustom:          (text: string) => void
  onReorder:            (paper: PaperItem[]) => void
  onExport:             () => void
  onAutoGenerate:       () => void
  canAutoGenerate:      boolean
  onClearPaper:         () => void
  user:                 User
}

interface SectionDraft { title: string; instruction: string; marksPerQ: number }

const DIALOG_INPUT =
  'w-full px-3 py-2 text-xs border border-stone-200 rounded-lg bg-white ' +
  'text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-900 ' +
  'placeholder:text-stone-300 transition'

function SectionEditDialog({
  initial, sectionsCount, onSave, onClose,
}: {
  initial:       SectionDraft | null
  sectionsCount: number
  onSave:        (d: SectionDraft) => void
  onClose:       () => void
}) {
  const defaultTitle = `Section ${String.fromCharCode(65 + sectionsCount)}`
  const [draft, setDraft] = useState<SectionDraft>(
    initial ?? { title: defaultTitle, instruction: '', marksPerQ: 1 }
  )
  function set<K extends keyof SectionDraft>(k: K, v: SectionDraft[K]) {
    setDraft(d => ({ ...d, [k]: v }))
  }
  function handleSave() {
    if (!draft.title.trim()) return
    onSave({ ...draft, title: draft.title.trim(), marksPerQ: Math.max(1, draft.marksPerQ) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[#faf9f7] rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden border border-stone-200">
        <div className="px-5 py-4 border-b border-stone-100">
          <h3 className="text-sm font-semibold text-stone-950">
            {initial ? 'Edit Section' : 'New Section'}
          </h3>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest block mb-1.5">
              Title
            </label>
            <input
              autoFocus
              className={DIALOG_INPUT}
              value={draft.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Section A · Multiple Choice Questions"
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest block mb-1.5">
              Instruction
            </label>
            <input
              className={DIALOG_INPUT}
              value={draft.instruction}
              onChange={e => set('instruction', e.target.value)}
              placeholder="e.g. Answer any 5 questions."
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest block mb-1.5">
              Marks per Question
            </label>
            <input
              type="number"
              min={1}
              max={20}
              className={DIALOG_INPUT}
              value={draft.marksPerQ}
              onChange={e => set('marksPerQ', parseInt(e.target.value) || 1)}
            />
            {initial && (
              <p className="text-[10px] text-zinc-400 mt-1">
                Changing marks per question will update all questions in this section.
              </p>
            )}
          </div>
        </div>
        <div className="px-5 py-3 flex justify-end gap-2 bg-stone-50 border-t border-stone-100">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded-lg border border-stone-200
                       text-stone-700 hover:bg-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!draft.title.trim()}
            className="px-4 py-1.5 text-xs rounded-lg bg-stone-900 text-white font-medium
                       hover:opacity-95 disabled:opacity-40 transition"
          >
            {initial ? 'Save Changes' : 'Add Section'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function PaperBuilder({
  papers,
  activeId,
  paper,
  paperTitle,
  setPaperTitle,
  rephrasing,
  sections,
  activeSectionId,
  onActiveSectionChange,
  onAddSection,
  onUpdateSection,
  onDeleteSection,
  onMoveToSection,
  onSwitchPaper,
  onNewPaper,
  onCloseTab,
  onRenameTab,
  onRemove,
  onRephrase,
  onUndoRephrase,
  onMarksChange,
  onTextChange,
  onAddCustom,
  onReorder,
  onExport,
  onAutoGenerate,
  canAutoGenerate,
  onClearPaper,
  user,
}: Props) {
  const isViewer = user.role === 'Viewer'

  // Sensors for sortable
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [tabDraft, setTabDraft] = useState('')

  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customText, setCustomText] = useState('')

  const [sectionDialog, setSectionDialog] = useState<{
    mode: 'add' | 'edit';
    sec: PaperSection | null;
  } | null>(null)

  function startRenameTab(id: string, currentTitle: string, e: React.MouseEvent) {
    if (isViewer) return
    e.stopPropagation()
    setTabDraft(currentTitle)
    setEditingTabId(id)
  }

  function commitRename(id: string) {
    const trimmed = tabDraft.trim()
    if (trimmed) onRenameTab(id, trimmed)
    setEditingTabId(null)
  }

  function submitCustom() {
    const trimmed = customText.trim()
    if (trimmed) {
      onAddCustom(trimmed)
      setCustomText('')
      setShowCustomForm(false)
    }
  }

  function handleSaveSection(draft: SectionDraft) {
    if (sectionDialog?.mode === 'add') {
      const newSec: PaperSection = {
        id:          mkUid(),
        title:       draft.title,
        instruction: draft.instruction,
        marksPerQ:   draft.marksPerQ,
      }
      onAddSection(newSec)
    } else if (sectionDialog?.mode === 'edit' && sectionDialog.sec) {
      onUpdateSection(sectionDialog.sec.id, {
        title:       draft.title,
        instruction: draft.instruction,
        marksPerQ:   draft.marksPerQ,
      })
    }
    setSectionDialog(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    if (isViewer) return
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeIndex = paper.findIndex(i => i.uid === active.id)
    const overIndex  = paper.findIndex(i => i.uid === over.id)
    if (activeIndex === -1 || overIndex === -1) return

    // Verify both items belong to the same section (drag reorder only within sections)
    const activeItem = paper[activeIndex]
    const overItem   = paper[overIndex]
    if (activeItem.sectionId !== overItem.sectionId) return

    const reordered = arrayMove(paper, activeIndex, overIndex)
    onReorder(reordered)
  }

  const activePaper  = papers.find(p => p.id === activeId) ?? papers[0]
  const totalMarks   = paper.reduce((s, i) => s + i.marks, 0)
  const hasSections  = sections.length > 0
  const getSecItems  = (id: string) => paper.filter(i => i.sectionId === id)
  const unsectioned  = paper.filter(i => !i.sectionId || !sections.find(s => s.id === i.sectionId))

  return (
    <main className="flex flex-col flex-1 overflow-hidden bg-[#f5f3ef]">

      {/* ── Paper tabs ─────────────────────────────────────────────────── */}
      <div className="flex items-end gap-0 px-4 pt-2 bg-[#faf9f7] border-b border-stone-200 shrink-0 overflow-x-auto">
        {papers.map(p => (
          <div
            key={p.id}
            onClick={() => onSwitchPaper(p.id)}
            className={`group flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-t-md
                        cursor-pointer select-none border border-b-0 mr-1 transition whitespace-nowrap
              ${p.id === activeId
                ? 'bg-[#f5f3ef] border-stone-200 text-stone-900'
                : 'bg-stone-50 border-transparent text-stone-400 hover:text-stone-600 hover:bg-stone-50'
              }`}
          >
            {editingTabId === p.id ? (
              <input
                autoFocus
                className="max-w-[120px] bg-white border border-stone-900 rounded px-1
                           text-xs text-stone-800 outline-none"
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
                title={isViewer ? undefined : "Double-click to rename"}
              >
                {p.title}
              </span>
            )}
            {p.items.length > 0 && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-mono
                ${p.id === activeId ? 'bg-stone-200 text-stone-700' : 'bg-stone-100 text-stone-400'}`}>
                {p.items.length}
              </span>
            )}
            {papers.length > 1 && !isViewer && (
              <button
                onClick={e => { e.stopPropagation(); onCloseTab(p.id) }}
                className="ml-1.5 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500
                           leading-none transition rounded-full w-4 h-4 flex items-center justify-center"
                title="Close paper"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {!isViewer && (
          <button
            onClick={onNewPaper}
            className="px-3 py-2 text-xs text-stone-400 hover:text-stone-800 transition mb-0 self-end font-semibold"
            title="New paper"
          >
            + New
          </button>
        )}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-[#faf9f7] border-b border-stone-200 shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <input
            type="text"
            value={paperTitle}
            onChange={e => setPaperTitle(e.target.value)}
            disabled={isViewer}
            className="flex-1 max-w-xs text-xs font-semibold text-stone-800 bg-transparent border-b border-transparent
                       hover:border-stone-300 focus:border-stone-900 focus:outline-none px-1 py-0.5 transition disabled:hover:border-transparent"
          />
          <span className="text-[11px] font-mono text-stone-400 whitespace-nowrap">
            {paper.length} questions · {totalMarks} marks
          </span>
        </div>
        {!isViewer && (
          <div className="flex items-center gap-2 ml-3">
            <button
              onClick={onAutoGenerate}
              disabled={!canAutoGenerate}
              title={canAutoGenerate ? 'Auto-generate paper from bank' : 'Load a question bank first'}
              className="px-3 py-1.5 text-xs rounded-md border border-stone-200 text-stone-800
                         hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition font-medium"
            >
              ✦ Auto-Generate
            </button>
            {paper.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm(`Clear all ${paper.length} questions from this paper?`)) onClearPaper()
                }}
                className="px-3 py-1.5 text-xs rounded-md border border-red-200 text-red-600
                           hover:bg-red-50 transition font-medium"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setShowCustomForm(v => !v)}
              className="px-3 py-1.5 text-xs rounded-md border border-stone-200 text-stone-600
                         hover:bg-stone-50 transition font-medium"
            >
              + Custom
            </button>
          </div>
        )}
      </div>

      {/* Custom question form */}
      {showCustomForm && !isViewer && (
        <div className="px-6 py-3 bg-[#faf9f7] border-b border-stone-200 shrink-0">
          <textarea
            className="w-full px-3 py-2 text-xs bg-white border border-stone-200 text-stone-800 rounded-md resize-none
                       focus:outline-none focus:ring-1 focus:ring-stone-900"
            rows={2}
            placeholder="Type your custom question here..."
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submitCustom() }}
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button onClick={submitCustom} disabled={!customText.trim()}
              className="px-3 py-1.5 text-xs rounded-md bg-stone-900 text-white hover:opacity-95 disabled:opacity-40 transition font-medium">
              Add Question
            </button>
            <button onClick={() => { setShowCustomForm(false); setCustomText('') }}
              className="px-3 py-1.5 text-xs rounded-md bg-stone-100 text-stone-600 hover:opacity-90 transition font-medium">
              Cancel
            </button>
            <span className="text-[10px] text-zinc-400 self-center ml-1">Ctrl+Enter to add</span>
          </div>
        </div>
      )}

      {/* ── Paper list ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {paper.length === 0 && !hasSections ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 text-xs gap-2">
            <p className="text-3xl">📋</p>
            <p className="font-medium text-zinc-500">This paper is empty.</p>
            <p className="text-[11px] text-zinc-400">Add questions from the left question bank panel.</p>
            {!isViewer && (
              <button
                onClick={() => setSectionDialog({ mode: 'add', sec: null })}
                className="mt-4 px-4 py-2 text-xs rounded-lg border border-dashed border-stone-300
                           text-stone-600 hover:border-stone-400 transition"
              >
                + Add a section to organise your paper
              </button>
            )}
          </div>
        ) : hasSections ? (
          /* ── Sectioned view ─────────────────────────────────────────── */
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="space-y-6">
              {sections.map(sec => {
                const secItems = getSecItems(sec.id)
                const isActive = activeSectionId === sec.id
                return (
                  <div key={sec.id}>
                    {/* Section header */}
                    <div
                      onClick={() => !isViewer && onActiveSectionChange(sec.id)}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg border transition mb-2
                        ${isActive
                          ? 'border-stone-900 bg-stone-50'
                          : 'border-stone-200 bg-[#faf9f7] hover:border-stone-300'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 transition
                          ${isActive ? 'bg-stone-900' : 'bg-stone-200'}`} />
                        <div>
                          <p className="text-xs font-semibold text-stone-800 leading-tight">{sec.title}</p>
                          {(sec.instruction || sec.marksPerQ > 0) && (
                            <p className="text-[11px] text-zinc-400 leading-tight mt-0.5">
                              {sec.instruction ? sec.instruction : ''}
                              {sec.marksPerQ ? ` · ${sec.marksPerQ}m each` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 ml-2">
                        <span className="text-[11px] font-mono text-zinc-400 mr-2">
                          {secItems.length}q · {secItems.reduce((s, i) => s + i.marks, 0)}m
                        </span>
                        {!isViewer && (
                          <>
                            <button
                              onClick={e => { e.stopPropagation(); setSectionDialog({ mode: 'edit', sec }) }}
                              className="w-5 h-5 flex items-center justify-center rounded text-stone-400
                                         hover:text-stone-900 transition text-[10px]"
                              title="Edit section"
                            >
                              ✎
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                if (secItems.length === 0 || window.confirm(
                                  `Delete "${sec.title}"? Its ${secItems.length} question${secItems.length !== 1 ? 's' : ''} will become unsectioned.`
                                )) onDeleteSection(sec.id)
                              }}
                              className="w-5 h-5 flex items-center justify-center rounded text-zinc-400
                                         hover:text-red-500 transition text-[10px]"
                              title="Delete section"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {secItems.length > 0 ? (
                      <SortableContext
                        items={secItems.map(i => i.uid)}
                        strategy={verticalListSortingStrategy}
                      >
                        <ul className="space-y-2.5 ml-3">
                          {secItems.map((item, idx) => (
                            <PaperCard
                              key={item.uid}
                              item={item}
                              index={idx + 1}
                              rephrasing={rephrasing}
                              onRemove={onRemove}
                              onRephrase={onRephrase}
                              onUndoRephrase={onUndoRephrase}
                              onMarksChange={onMarksChange}
                              onTextChange={onTextChange}
                              sections={sections}
                              onMoveToSection={onMoveToSection}
                              user={user}
                            />
                          ))}
                        </ul>
                      </SortableContext>
                    ) : (
                      <div className="ml-3 p-3 border border-dashed border-stone-200 rounded-lg text-[10px] text-stone-400 text-center">
                        Empty section. Add questions to this section.
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Unsectioned questions */}
              {unsectioned.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-4 py-2 border-b border-stone-200 mb-2">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Unsectioned</span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {unsectioned.length}q · {unsectioned.reduce((s, i) => s + i.marks, 0)}m
                    </span>
                  </div>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext
                      items={unsectioned.map(i => i.uid)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="space-y-2.5">
                        {unsectioned.map((item, idx) => (
                          <PaperCard
                            key={item.uid}
                            item={item}
                            index={idx + 1}
                            rephrasing={rephrasing}
                            onRemove={onRemove}
                            onRephrase={onRephrase}
                            onUndoRephrase={onUndoRephrase}
                            onMarksChange={onMarksChange}
                            onTextChange={onTextChange}
                            sections={sections}
                            onMoveToSection={onMoveToSection}
                            user={user}
                          />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                </div>
              )}

              {!isViewer && (
                <div className="pt-2 flex justify-center">
                  <button
                    onClick={() => setSectionDialog({ mode: 'add', sec: null })}
                    className="px-4 py-2 text-xs rounded-lg border border-dashed border-stone-200 text-stone-500 hover:border-stone-300 hover:bg-stone-50 transition font-medium"
                  >
                    + Add another section
                  </button>
                </div>
              )}
            </div>
          </DndContext>
        ) : (
          /* ── Unsectioned flat list view ──────────────────────────────── */
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={paper.map(i => i.uid)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-2.5">
                {paper.map((item, idx) => (
                  <PaperCard
                    key={item.uid}
                    item={item}
                    index={idx + 1}
                    rephrasing={rephrasing}
                    onRemove={onRemove}
                    onRephrase={onRephrase}
                    onUndoRephrase={onUndoRephrase}
                    onMarksChange={onMarksChange}
                    onTextChange={onTextChange}
                    sections={sections}
                    onMoveToSection={onMoveToSection}
                    user={user}
                  />
                ))}
              </ul>
            </SortableContext>
            {!isViewer && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => setSectionDialog({ mode: 'add', sec: null })}
                  className="px-4 py-2 text-xs rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition font-medium"
                >
                  + Add a section to organize your paper
                </button>
              </div>
            )}
          </DndContext>
        )}
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      {sectionDialog && (
        <SectionEditDialog
          initial={sectionDialog.sec ? {
            title:       sectionDialog.sec.title,
            instruction: sectionDialog.sec.instruction || '',
            marksPerQ:   sectionDialog.sec.marksPerQ,
          } : null}
          sectionsCount={sections.length}
          onSave={handleSaveSection}
          onClose={() => setSectionDialog(null)}
        />
      )}
    </main>
  )
}
