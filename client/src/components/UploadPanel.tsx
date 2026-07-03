import { useRef, useState, DragEvent, ChangeEvent } from 'react';

interface Props {
  onUpload: (file: File) => Promise<void>;
  fileName:  string | null;
  wordCount: number | null;
  disabled?: boolean;
}

const MAX_BYTES = 50 * 1024 * 1024;

export default function UploadPanel({ onUpload, fileName, wordCount, disabled }: Props) {
  const inputRef          = useRef<HTMLInputElement>(null);
  const [dragging, setDragging]   = useState(false);
  const [error,    setError]      = useState<string | null>(null);
  const [loading,  setLoading]    = useState(false);

  async function handleFile(file: File) {
    setError(null);
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are accepted.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('File size exceeds 50 MB limit.');
      return;
    }
    setLoading(true);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  if (fileName) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-green-800 text-sm">PDF uploaded</p>
            <p className="mt-1 text-gray-700 font-semibold">{fileName}</p>
            <p className="text-xs text-gray-500 mt-0.5">{wordCount?.toLocaleString()} words extracted</p>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="text-xs text-indigo-600 hover:underline shrink-0"
            disabled={disabled || loading}
          >
            Replace
          </button>
        </div>
        <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={onChange} />
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !disabled && !loading && inputRef.current?.click()}
        className={[
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-colors',
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/40',
          (disabled || loading) ? 'opacity-60 cursor-not-allowed' : '',
        ].join(' ')}
      >
        <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <div className="text-center">
          <p className="font-medium text-gray-700">{loading ? 'Uploading…' : 'Drop your PDF here'}</p>
          <p className="text-sm text-gray-500 mt-0.5">or <span className="text-indigo-600 underline">browse</span> · max 50 MB</p>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={onChange} />
    </div>
  );
}
