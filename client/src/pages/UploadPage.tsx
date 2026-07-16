import { useRef, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/ui';
import { bankApi } from '../lib/api';

type Step = 'idle' | 'uploading' | 'reading' | 'extracting' | 'error';

const STEPS = [
  { key: 'uploading',   label: 'Uploading' },
  { key: 'reading',     label: 'Reading Paper' },
  { key: 'extracting',  label: 'Extracting Questions' },
] as const;

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function UploadCloudIcon() {
  return (
    <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
    </svg>
  );
}

export default function UploadPage() {
  const navigate = useNavigate();
  const inputRef  = useRef<HTMLInputElement>(null);
  const [file,    setFile]    = useState<File | null>(null);
  const [drag,    setDrag]    = useState(false);
  const [step,    setStep]    = useState<Step>('idle');
  const [error,   setError]   = useState('');
  const [subject, setSubject] = useState('');
  const [cls,     setCls]     = useState('');
  const [chapter, setChapter] = useState('');
  const [year,    setYear]    = useState('');

  const accept = (f: File) => {
    const ok = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'].includes(f.type);
    const tooBig = f.size > 20 * 1024 * 1024;
    if (!ok)    { setError('Only PDF, JPG, or PNG files are accepted.'); return; }
    if (tooBig) { setError('File must be under 20 MB.'); return; }
    setError('');
    setFile(f);
    setStep('idle');
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) accept(f);
  }, []);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) accept(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStep('uploading');
    setError('');

    // Simulate step progression while the server works
    const t1 = setTimeout(() => setStep('reading'),    1500);
    const t2 = setTimeout(() => setStep('extracting'), 4000);

    try {
      const fd = new FormData();
      fd.append('file', file);
      if (subject) fd.append('subject',    subject);
      if (cls)     fd.append('class',      cls);
      if (chapter) fd.append('chapter',    chapter);
      if (year)    fd.append('sourceYear', year);

      const res = await bankApi.upload(fd);
      clearTimeout(t1); clearTimeout(t2);

      if (!res.ok) {
        const body = await res.json() as { error: string };
        throw new Error(body.error);
      }
      const data = await res.json() as { uploadId: string; needsReview: number };
      if (data.needsReview > 0) {
        navigate(`/verify/${data.uploadId}`);
      } else {
        navigate('/bank');
      }
    } catch (err) {
      clearTimeout(t1); clearTimeout(t2);
      setStep('error');
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  };

  const currentStepIdx = STEPS.findIndex(s => s.key === step);
  const isProcessing = step === 'uploading' || step === 'reading' || step === 'extracting';

  return (
    <Layout>
      <div className="px-8 py-8 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link to="/dashboard" className="text-xs text-slate-400 hover:text-slate-600 transition-colors mb-3 inline-flex items-center gap-1.5 focus-ring rounded">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Dashboard
          </Link>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight mt-1">Analyse a past paper</h1>
          <p className="text-slate-500 text-sm mt-1">Upload a PDF or image — we'll extract questions and add them to your bank.</p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => !isProcessing && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload file drop zone"
          onKeyDown={e => e.key === 'Enter' && !isProcessing && inputRef.current?.click()}
          className={`card border-2 border-dashed transition-all duration-200 p-10 flex flex-col items-center justify-center text-center cursor-pointer mb-6 focus-ring ${
            drag         ? 'border-accent-400 bg-accent-50' :
            file         ? 'border-accent-300 bg-accent-50/30' :
            'border-surface-200 hover:border-accent-300 hover:bg-surface-50'
          } ${isProcessing ? 'pointer-events-none' : ''}`}
        >
          <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={onPick} aria-hidden="true" />

          {!file ? (
            <>
              <UploadCloudIcon />
              <p className="mt-3 text-sm font-medium text-slate-600">Drag and drop your file here</p>
              <p className="text-xs text-slate-400 mt-1">or click to browse</p>
              <p className="text-2xs text-slate-300 mt-3">PDF, JPG, PNG — max 20 MB</p>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-100 flex items-center justify-center text-accent-600 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-700">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(1)} MB — <span className="text-accent-600 hover:underline" onClick={e => { e.stopPropagation(); setFile(null); setStep('idle'); }}>Change file</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 px-4 py-3 rounded-card-inner bg-rose-50 border border-rose-200 text-rose-700 text-sm" role="alert">
            {error}
          </div>
        )}

        {/* Metadata fields */}
        {!isProcessing && file && (
          <div className="card p-5 mb-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Paper Details <span className="font-normal normal-case text-slate-400">(optional)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label" htmlFor="subject">Subject</label>
                <input id="subject" className="form-input" placeholder="e.g. Physics" value={subject} onChange={e => setSubject(e.target.value)} />
              </div>
              <div>
                <label className="form-label" htmlFor="class">Class / Grade</label>
                <input id="class" className="form-input" placeholder="e.g. Grade 10" value={cls} onChange={e => setCls(e.target.value)} />
              </div>
              <div>
                <label className="form-label" htmlFor="chapter">Chapter / Topic</label>
                <input id="chapter" className="form-input" placeholder="e.g. Chapter 3 — Motion" value={chapter} onChange={e => setChapter(e.target.value)} />
              </div>
              <div>
                <label className="form-label" htmlFor="year">Year</label>
                <input id="year" className="form-input" placeholder="e.g. 2023" value={year} onChange={e => setYear(e.target.value)} maxLength={4} />
              </div>
            </div>
          </div>
        )}

        {/* Progress steps */}
        {isProcessing && (
          <div className="card p-6 mb-6">
            <div className="flex items-center justify-between relative">
              {/* Connector line */}
              <div className="absolute left-0 right-0 top-4 h-px bg-surface-200 mx-8 -z-10" aria-hidden="true" />
              {STEPS.map((s, i) => {
                const done    = i < currentStepIdx;
                const current = i === currentStepIdx;
                return (
                  <div key={s.key} className="flex flex-col items-center gap-2 flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 transition-all duration-300 ${
                      done    ? 'bg-emerald-500 text-white' :
                      current ? 'bg-accent-600 text-white ring-4 ring-accent-100' :
                                'bg-surface-200 text-slate-400'
                    }`}>
                      {done ? <CheckIcon /> : current ? <Spinner className="w-4 h-4" /> : <span className="text-xs font-semibold">{i + 1}</span>}
                    </div>
                    <p className={`text-xs font-medium ${current ? 'text-accent-700' : done ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {s.label}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="text-center text-xs text-slate-400 mt-5">This may take 10–30 seconds depending on the paper size.</p>
          </div>
        )}

        {/* Action button */}
        {!isProcessing && (
          <button
            onClick={handleUpload}
            disabled={!file}
            className="btn-primary w-full justify-center py-2.5"
          >
            Analyse Paper
          </button>
        )}
      </div>
    </Layout>
  );
}
