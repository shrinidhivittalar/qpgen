import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useGeneration } from '../hooks/useGeneration';
import UploadPanel from '../components/UploadPanel';
import SchemePicker from '../components/SchemePicker';
import TypeConfigurator from '../components/TypeConfigurator';
import GenerationProgress from '../components/GenerationProgress';
import QuestionBlock from '../components/QuestionBlock';
import type { TypeConfig } from '../types';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const { state, uploadFile, setTypeConfig, applyScheme, generate } = useGeneration();

  const { setId, fileName, wordCount, typeConfig, results, isGenerating, exportError } = state;

  // 'pending' = scheme step not yet resolved; 'done' = user selected or skipped
  const [schemeStep, setSchemeStep] = useState<'pending' | 'done'>('pending');

  // Reset scheme step when a new PDF is uploaded
  function handleUpload(file: File) {
    setSchemeStep('pending');
    return uploadFile(file);
  }

  function handleSchemeApply(parsedConfig: TypeConfig[]) {
    applyScheme(parsedConfig);
    setSchemeStep('done');
  }

  function handleSchemeSkip() {
    setSchemeStep('done');
  }

  const canGenerate = !isGenerating && Boolean(setId) && schemeStep === 'done' && typeConfig.some(c => c.count > 0);

  const successBlocks = Object.entries(results)
    .filter(([, r]) => r.status === 'success')
    .map(([type, r]) => ({
      questionType: type,
      totalMarks:   r.totalMarks ?? 0,
      questions:    r.questions ?? [],
    }));

  const hasResults = Object.values(results).some(r => r.status === 'success' || r.status === 'failed');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Question Generator</h1>
          <p className="text-xs text-gray-500">Welcome, {user?.name}</p>
        </div>
        <button
          onClick={logout}
          className="text-sm text-indigo-600 hover:underline"
        >
          Sign out
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
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

        {/* Step 2 — Scheme picker (shown after PDF upload) */}
        {setId && schemeStep === 'pending' && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-gray-800">
              <span className="text-indigo-500 mr-2">2</span>Select question paper scheme
            </h2>
            <SchemePicker onApply={handleSchemeApply} onSkip={handleSchemeSkip} />
          </section>
        )}

        {/* Step 3 — Configure types (shown after scheme step resolved) */}
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

        {/* Export / request error */}
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
    </div>
  );
}
