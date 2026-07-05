import { useEffect, useRef, useState, ChangeEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useGeneration } from '../hooks/useGeneration';
import { apiFetch } from '../lib/api';
import UploadPanel from '../components/UploadPanel';
import SchemePicker from '../components/SchemePicker';
import TypeConfigurator from '../components/TypeConfigurator';
import GenerationProgress from '../components/GenerationProgress';
import QuestionBlock from '../components/QuestionBlock';
import type { Scheme, TypeConfig } from '../types';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const { state, uploadFile, setTypeConfig, setIntent, applyScheme, generate } = useGeneration();
  const {
    setId, fileName, wordCount, typeConfig, results, isGenerating, exportError,
    difficultyDefault, tone, bankId,
  } = state;

  // ── Scheme step state ──────────────────────────────────────────────────────
  const [schemeStep, setSchemeStep] = useState<'pending' | 'done'>('pending');

  function handleUpload(file: File) {
    setSchemeStep('pending');
    return uploadFile(file);
  }

  function handleSchemeApply(parsedConfig: TypeConfig[], schemeId?: string) {
    applyScheme(parsedConfig, schemeId ?? null);
    setSchemeStep('done');
  }

  function handleSchemeSkip() {
    setSchemeStep('done');
  }

  const canGenerate = !isGenerating && Boolean(setId) && schemeStep === 'done' && typeConfig.some(c => c.count > 0);

  // ── My Schemes sidebar state ───────────────────────────────────────────────
  const [schemes,       setSchemes]       = useState<Scheme[]>([]);
  const [schemesLoading, setSchemesLoading] = useState(true);
  const [deleteTarget,  setDeleteTarget]  = useState<string | null>(null);
  const [deleting,      setDeleting]      = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [replacing,     setReplacing]     = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  async function loadSchemes() {
    try {
      const res  = await apiFetch('/api/schemes');
      const data = await res.json() as Scheme[];
      setSchemes(data);
    } catch {
      setSchemes([]);
    } finally {
      setSchemesLoading(false);
    }
  }

  useEffect(() => { loadSchemes(); }, []);

  async function handleUseScheme(scheme: Scheme) {
    applyScheme(scheme.parsedConfig as TypeConfig[], scheme.schemeId);
    setSchemeStep('done');
  }

  async function handleDeleteScheme() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/schemes/${deleteTarget}`, { method: 'DELETE' });
      setSchemes(s => s.filter(x => x.schemeId !== deleteTarget));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function handleReplaceFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !replaceTarget) return;

    const existing = schemes.find(s => s.schemeId === replaceTarget);
    if (!existing) return;

    setReplacing(true);
    try {
      const form = new FormData();
      form.append('file',     file);
      form.append('name',     existing.name);
      form.append('subject',  existing.subject);
      form.append('standard', existing.standard);

      const res  = await apiFetch(`/api/schemes/${replaceTarget}/replace`, { method: 'PATCH', body: form });
      const body = await res.json() as Scheme & { error?: string };
      if (res.ok) {
        setSchemes(s => s.map(x => x.schemeId === replaceTarget ? { ...x, ...body } : x));
      }
    } finally {
      setReplacing(false);
      setReplaceTarget(null);
    }
  }

  // ── Results helpers ────────────────────────────────────────────────────────
  const successBlocks = Object.entries(results)
    .filter(([, r]) => r.status === 'success')
    .map(([type, r]) => ({ questionType: type, totalMarks: r.totalMarks ?? 0, questions: r.questions ?? [] }));

  const hasResults = Object.values(results).some(r => r.status === 'success' || r.status === 'failed');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Question Generator</h1>
          <p className="text-xs text-gray-500">Welcome, {user?.name}</p>
        </div>
        <button onClick={logout} className="text-sm text-indigo-600 hover:underline">
          Sign out
        </button>
      </header>

      {/* 2-column layout */}
      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 items-start">

        {/* ── Left: main generation flow ── */}
        <main className="space-y-8">
          {/* Step 1 — Upload PDF */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-gray-800">
              <span className="text-indigo-500 mr-2">1</span>Upload source PDF
            </h2>
            <UploadPanel
              onUpload={handleUpload}
              fileName={fileName}
              wordCount={wordCount}
              disabled={isGenerating}
            />
          </section>

          {/* Step 2 — Scheme picker */}
          {setId && schemeStep === 'pending' && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-gray-800">
                <span className="text-indigo-500 mr-2">2</span>Select question paper scheme
              </h2>
              <SchemePicker
                schemes={schemes}
                onApply={handleSchemeApply}
                onSkip={handleSchemeSkip}
                onSchemeSaved={loadSchemes}
              />
            </section>
          )}

          {/* Step 3 — Type configurator */}
          {setId && schemeStep === 'done' && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-800">
                  <span className="text-indigo-500 mr-2">3</span>Choose question types
                </h2>
                <button
                  onClick={() => setSchemeStep('pending')}
                  className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                >
                  Change scheme
                </button>
              </div>
              <TypeConfigurator
                config={typeConfig}
                onChange={setTypeConfig}
                difficultyDefault={difficultyDefault}
                tone={tone}
                bankId={bankId}
                onIntentChange={setIntent}
                disabled={isGenerating}
              />
            </section>
          )}

          {/* Generate button */}
          {setId && schemeStep === 'done' && (
            <button
              onClick={generate}
              disabled={!canGenerate}
              className={[
                'w-full rounded-xl py-3 text-sm font-semibold transition-colors',
                canGenerate
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed',
              ].join(' ')}
            >
              {isGenerating ? 'Generating…' : 'Generate Questions'}
            </button>
          )}

          {exportError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {exportError}
            </p>
          )}

          {/* Step 4 — Generation progress */}
          {(isGenerating || hasResults) && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-gray-800">
                <span className="text-indigo-500 mr-2">4</span>Generation status
              </h2>
              <GenerationProgress
                typeConfig={typeConfig}
                results={results}
                isGenerating={isGenerating}
                difficultyDefault={difficultyDefault}
                tone={tone}
              />
            </section>
          )}

          {/* Step 5 — Question blocks */}
          {successBlocks.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-gray-800">
                <span className="text-indigo-500 mr-2">5</span>Generated questions
              </h2>
              <div className="space-y-3">
                {successBlocks.map(b => (
                  <QuestionBlock
                    key={b.questionType}
                    questionType={b.questionType}
                    totalMarks={b.totalMarks}
                    questions={b.questions}
                  />
                ))}
              </div>
            </section>
          )}
        </main>

        {/* ── Right: My Schemes sidebar ── */}
        <aside className="space-y-3">
          <h2 className="text-base font-semibold text-gray-800">My Schemes</h2>

          {/* Hidden file input for Replace */}
          <input
            ref={replaceInputRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={handleReplaceFile}
          />

          {replacing && (
            <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
              <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Replacing scheme…
            </div>
          )}

          {schemesLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
              <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Loading…
            </div>
          ) : schemes.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">No saved schemes yet.</p>
          ) : (
            <div className="space-y-2">
              {schemes.map(scheme => (
                <div
                  key={scheme.schemeId}
                  className="rounded-xl border border-gray-200 bg-white p-3 space-y-2"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800 truncate">{scheme.name}</p>
                    <p className="text-xs text-gray-500">
                      {scheme.subject} · {scheme.standard}
                      {scheme.examType ? ` · ${scheme.examType}` : ''}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Updated {new Date(scheme.updatedAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleUseScheme(scheme)}
                      className="flex-1 rounded-lg py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      Use
                    </button>
                    <button
                      onClick={() => { setReplaceTarget(scheme.schemeId); replaceInputRef.current?.click(); }}
                      className="flex-1 rounded-lg py-1.5 text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      Replace
                    </button>
                    <button
                      onClick={() => setDeleteTarget(scheme.schemeId)}
                      className="flex-1 rounded-lg py-1.5 text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Delete
                    </button>
                  </div>

                  {/* Inline delete confirm */}
                  {deleteTarget === scheme.schemeId && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-2 space-y-2">
                      <p className="text-xs text-red-700">
                        Delete this scheme? Sets generated with it are unaffected.
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={handleDeleteScheme}
                          disabled={deleting}
                          className="flex-1 rounded-lg py-1.5 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                        >
                          {deleting ? 'Deleting…' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(null)}
                          className="flex-1 rounded-lg py-1.5 text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
