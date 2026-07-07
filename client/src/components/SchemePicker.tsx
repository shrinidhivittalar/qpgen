import { useRef, useState, ChangeEvent } from 'react';
import { apiFetch } from '../lib/api';
import type { Scheme, TypeConfig, PaperStructure } from '../types';

interface Props {
  schemes:       Scheme[];
  onApply:       (parsedConfig: TypeConfig[], schemeId?: string, paperStructure?: PaperStructure | null) => void;
  onSkip:        () => void;
  onSchemeSaved: () => void;
}

const MAX_SCHEME_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES    = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// ── Saved scheme list ────────────────────────────────────────────────────────
function SchemeList({
  schemes,
  onApply,
  onUploadNew,
}: {
  schemes:     Scheme[];
  onApply:     (parsedConfig: TypeConfig[], schemeId: string, paperStructure: PaperStructure | null) => void;
  onUploadNew: () => void;
}) {
  const [selected, setSelected] = useState<string>(schemes[0]?.schemeId ?? '');
  const active = schemes.find(s => s.schemeId === selected);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {schemes.map(s => (
          <label
            key={s.schemeId}
            className={[
              'flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors',
              selected === s.schemeId
                ? 'border-indigo-300 bg-indigo-50'
                : 'border-gray-200 bg-white hover:border-indigo-200',
            ].join(' ')}
          >
            <input
              type="radio"
              name="scheme"
              value={s.schemeId}
              checked={selected === s.schemeId}
              onChange={() => setSelected(s.schemeId)}
              className="mt-0.5 accent-indigo-600"
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 text-sm">{s.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {s.subject} · {s.standard}{s.examType ? ` · ${s.examType}` : ''}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {s.parsedConfig.length} question type{s.parsedConfig.length !== 1 ? 's' : ''}
              </p>
            </div>
          </label>
        ))}

        <button
          onClick={onUploadNew}
          className="w-full flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          Upload a different scheme
        </button>
      </div>

      <button
        onClick={() => active && onApply(active.parsedConfig as TypeConfig[], active.schemeId, active.paperStructure ?? null)}
        disabled={!active}
        className="w-full rounded-xl py-2.5 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
      >
        Use this scheme
      </button>
    </div>
  );
}

// ── Upload form ──────────────────────────────────────────────────────────────
type UploadPhase =
  | { tag: 'form' }
  | { tag: 'uploading' }
  | { tag: 'preview'; schemeId: string; suggestedName: string; parsedConfig: TypeConfig[]; previewSections: string[]; paperStructure: PaperStructure | null }
  | { tag: 'saving' };

function SchemeUploadForm({
  hasExistingSchemes,
  onBack,
  onApply,
  onSchemeSaved,
}: {
  hasExistingSchemes: boolean;
  onBack:             () => void;
  onApply:            (parsedConfig: TypeConfig[], schemeId?: string, paperStructure?: PaperStructure | null) => void;
  onSchemeSaved:      () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase,    setPhase]    = useState<UploadPhase>({ tag: 'form' });
  const [file,     setFile]     = useState<File | null>(null);
  const [subject,  setSubject]  = useState('');
  const [standard, setStandard] = useState('');
  const [saveName, setSaveName] = useState('');
  const [error,    setError]    = useState<string | null>(null);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) {
      setError('Only PDF and Word (.docx) files are accepted.');
      return;
    }
    if (f.size > MAX_SCHEME_BYTES) {
      setError('File size exceeds 5 MB limit.');
      return;
    }
    setFile(f);
    e.target.value = '';
  }

  async function handleUpload() {
    if (!file || !subject.trim() || !standard.trim()) return;
    setError(null);
    // Derive name from filename, strip extension
    const autoName = file.name.replace(/\.[^.]+$/, '').trim() || file.name;
    setSaveName(autoName);
    setPhase({ tag: 'uploading' });

    try {
      const form = new FormData();
      form.append('file',     file);
      form.append('name',     autoName);
      form.append('subject',  subject.trim());
      form.append('standard', standard.trim());

      const res  = await apiFetch('/api/schemes/upload', { method: 'POST', body: form });
      const body = await res.json() as {
        schemeId?: string; parsedConfig?: TypeConfig[]; previewSections?: string[];
        paperStructure?: PaperStructure | null; error?: string;
      };

      if (!res.ok) {
        setPhase({ tag: 'form' });
        setError(body.error ?? 'Upload failed.');
        return;
      }

      setPhase({
        tag:             'preview',
        schemeId:        body.schemeId!,
        suggestedName:   autoName,
        parsedConfig:    body.parsedConfig!,
        previewSections: body.previewSections ?? [],
        paperStructure:  body.paperStructure ?? null,
      });
    } catch {
      setPhase({ tag: 'form' });
      setError('Network error. Please try again.');
    }
  }

  async function handleSave(schemeId: string, parsedConfig: TypeConfig[], paperStructure: PaperStructure | null) {
    setPhase({ tag: 'saving' });
    onSchemeSaved();
    onApply(parsedConfig, schemeId, paperStructure);
  }

  async function handleSkip(schemeId: string, parsedConfig: TypeConfig[], paperStructure: PaperStructure | null) {
    setPhase({ tag: 'saving' });
    try {
      await apiFetch(`/api/schemes/${schemeId}`, { method: 'DELETE' });
    } catch {
      // ignore — worst case a ghost scheme exists, not a blocker
    }
    onApply(parsedConfig, undefined, paperStructure); // no schemeId — scheme was not kept
  }

  // ── preview phase ──────────────────────────────────────────────────────────
  if (phase.tag === 'preview') {
    const { schemeId, parsedConfig, previewSections, paperStructure } = phase;
    const isSaving = false;

    return (
      <div className="space-y-4">
        {hasExistingSchemes && (
          <button onClick={onBack} className="text-xs text-indigo-600 hover:underline">
            ← Back to saved schemes
          </button>
        )}

        <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-green-800">Scheme parsed successfully</p>
          <ul className="space-y-1">
            {previewSections.map((s, i) => (
              <li key={i} className="text-xs text-green-700 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <p className="text-sm font-medium text-gray-800">Save this scheme for future use?</p>
          <input
            type="text"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="Scheme name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleSave(schemeId, parsedConfig, paperStructure)}
              disabled={isSaving}
              className="flex-1 rounded-xl py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => handleSkip(schemeId, parsedConfig, paperStructure)}
              disabled={isSaving}
              className="flex-1 rounded-xl py-2 text-sm font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              Skip — use once only
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── saving / uploading spinner ─────────────────────────────────────────────
  if (phase.tag === 'uploading' || phase.tag === 'saving') {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
        <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        {phase.tag === 'uploading' ? 'Parsing scheme…' : 'Saving…'}
      </div>
    );
  }

  // ── upload form ────────────────────────────────────────────────────────────
  const canSubmit = Boolean(file && subject.trim() && standard.trim());

  return (
    <div className="space-y-3">
      {hasExistingSchemes && (
        <button onClick={onBack} className="text-xs text-indigo-600 hover:underline">
          ← Back to saved schemes
        </button>
      )}

      <div
        onClick={() => inputRef.current?.click()}
        className={[
          'flex items-center gap-3 rounded-xl border-2 border-dashed p-4 cursor-pointer transition-colors',
          file ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/40',
        ].join(' ')}
      >
        <svg className="w-8 h-8 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <div>
          {file ? (
            <>
              <p className="text-sm font-medium text-green-800">{file.name}</p>
              <p className="text-xs text-gray-500">Click to replace</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700">Drop PDF or Word file here</p>
              <p className="text-xs text-gray-500">or click to browse · max 5 MB</p>
            </>
          )}
        </div>
        <input ref={inputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={onFileChange} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Subject"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <input
          type="text"
          value={standard}
          onChange={e => setStandard(e.target.value)}
          placeholder="Standard / Grade"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleUpload}
        disabled={!canSubmit}
        className="w-full rounded-xl py-2.5 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
      >
        Upload & parse scheme
      </button>
    </div>
  );
}

// ── Main SchemePicker ────────────────────────────────────────────────────────
export default function SchemePicker({ schemes, onApply, onSkip, onSchemeSaved }: Props) {
  const [uploadMode, setUploadMode] = useState(schemes.length === 0);

  return (
    <div className="space-y-3">
      {uploadMode ? (
        <SchemeUploadForm
          hasExistingSchemes={schemes.length > 0}
          onBack={() => setUploadMode(false)}
          onApply={onApply}
          onSchemeSaved={onSchemeSaved}
        />
      ) : (
        <SchemeList
          schemes={schemes}
          onApply={(parsedConfig, schemeId, paperStructure) => onApply(parsedConfig, schemeId, paperStructure)}
          onUploadNew={() => setUploadMode(true)}
        />
      )}

      <button
        onClick={onSkip}
        className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
      >
        Skip — I'll configure question types manually
      </button>
    </div>
  );
}
