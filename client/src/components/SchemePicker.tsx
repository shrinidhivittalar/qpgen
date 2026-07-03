import { useEffect, useRef, useState, ChangeEvent } from 'react';
import { apiFetch } from '../lib/api';
import type { Scheme, TypeConfig } from '../types';

interface Props {
  onApply: (parsedConfig: TypeConfig[]) => void;
  onSkip:  () => void;
}

const MAX_SCHEME_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES    = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

function SchemeList({
  schemes,
  onApply,
  onUploadNew,
}: {
  schemes: Scheme[];
  onApply: (parsedConfig: TypeConfig[]) => void;
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
                {s.subject} · {s.standard}
                {s.examType ? ` · ${s.examType}` : ''}
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
        onClick={() => active && onApply(active.parsedConfig as TypeConfig[])}
        disabled={!active}
        className="w-full rounded-xl py-2.5 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
      >
        Use this scheme
      </button>
    </div>
  );
}

function SchemeUploadForm({ onApply }: { onApply: (parsedConfig: TypeConfig[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file,     setFile]     = useState<File | null>(null);
  const [name,     setName]     = useState('');
  const [subject,  setSubject]  = useState('');
  const [standard, setStandard] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

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

  async function handleSubmit() {
    if (!file || !name.trim() || !subject.trim() || !standard.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file',     file);
      form.append('name',     name.trim());
      form.append('subject',  subject.trim());
      form.append('standard', standard.trim());

      const res  = await apiFetch('/api/schemes/upload', { method: 'POST', body: form });
      const body = await res.json() as { parsedConfig?: TypeConfig[]; error?: string };

      if (!res.ok) {
        setError(body.error ?? 'Upload failed.');
        return;
      }
      if (body.parsedConfig) onApply(body.parsedConfig);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = Boolean(file && name.trim() && subject.trim() && standard.trim() && !loading);

  return (
    <div className="space-y-3">
      {/* File picker */}
      <div
        onClick={() => !loading && inputRef.current?.click()}
        className={[
          'flex items-center gap-3 rounded-xl border-2 border-dashed p-4 cursor-pointer transition-colors',
          file ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/40',
          loading ? 'opacity-60 cursor-not-allowed' : '',
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

      {/* Metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {([
          ['name',     name,     setName,     'Name (e.g. 10th Maths Final)'],
          ['subject',  subject,  setSubject,  'Subject'],
          ['standard', standard, setStandard, 'Standard / Grade'],
        ] as const).map(([id, val, set, placeholder]) => (
          <input
            key={id}
            type="text"
            value={val}
            onChange={e => set(e.target.value)}
            placeholder={placeholder}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
          />
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-xl py-2.5 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
      >
        {loading ? 'Parsing scheme…' : 'Upload & parse scheme'}
      </button>
    </div>
  );
}

export default function SchemePicker({ onApply, onSkip }: Props) {
  const [schemes,     setSchemes]     = useState<Scheme[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [uploadMode,  setUploadMode]  = useState(false);

  useEffect(() => {
    apiFetch('/api/schemes')
      .then(r => r.json())
      .then((data: Scheme[]) => {
        setSchemes(data);
        if (data.length === 0) setUploadMode(true);
      })
      .catch(() => setUploadMode(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Loading saved schemes…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {uploadMode ? (
        <>
          {schemes.length > 0 && (
            <button
              onClick={() => setUploadMode(false)}
              className="text-xs text-indigo-600 hover:underline"
            >
              ← Back to saved schemes
            </button>
          )}
          <SchemeUploadForm onApply={onApply} />
        </>
      ) : (
        <SchemeList
          schemes={schemes}
          onApply={onApply}
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
