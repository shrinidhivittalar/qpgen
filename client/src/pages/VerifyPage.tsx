import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/ui';
import { bankApi } from '../lib/api';
import type { BankQuestion, QuestionType } from '../types';
import { QUESTION_TYPE_LABELS } from '../types';

type ViewMode = 'one-by-one' | 'list';

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const ok  = value >= 0.75;
  return (
    <span className={`badge ${ok ? 'badge-green' : 'badge-amber'}`} title={`AI confidence: ${pct}%`}>
      {pct}% confidence
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const label = QUESTION_TYPE_LABELS[type as QuestionType] ?? type;
  return <span className="badge badge-indigo">{label}</span>;
}

function EditForm({
  question,
  onSave,
  onCancel,
}: {
  question: BankQuestion;
  onSave: (updates: Partial<BankQuestion>) => void;
  onCancel: () => void;
}) {
  const [rawText,      setRawText]      = useState(question.rawText);
  const [marks,        setMarks]        = useState(String(question.marks ?? ''));
  const [questionType, setQuestionType] = useState(question.questionType);

  return (
    <div className="space-y-4">
      <div>
        <label className="form-label" htmlFor="edit-rawtext">Question Text</label>
        <textarea
          id="edit-rawtext"
          className="form-input min-h-[140px] resize-y font-mono text-xs leading-relaxed"
          value={rawText}
          onChange={e => setRawText(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label" htmlFor="edit-type">Question Type</label>
          <select
            id="edit-type"
            className="form-input"
            value={questionType}
            onChange={e => setQuestionType(e.target.value as QuestionType)}
          >
            {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="edit-marks">Marks</label>
          <input
            id="edit-marks"
            type="number"
            min="0"
            step="0.5"
            className="form-input"
            value={marks}
            onChange={e => setMarks(e.target.value)}
            placeholder="e.g. 2"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave({ rawText, questionType, marks: marks ? Number(marks) : null })}
          className="btn-primary text-xs"
        >
          Save & Accept
        </button>
        <button onClick={onCancel} className="btn-secondary text-xs">Cancel</button>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  const { uploadId } = useParams<{ uploadId: string }>();
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [idx,       setIdx]       = useState(0);
  const [mode,      setMode]      = useState<ViewMode>('one-by-one');
  const [editing,   setEditing]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [bulking,   setBulking]   = useState(false);
  const [verified,  setVerified]  = useState(0);

  useEffect(() => {
    if (!uploadId) return;
    bankApi.reviewQueue(uploadId)
      .then((qs: BankQuestion[]) => { setQuestions(qs); setLoading(false); })
      .catch(() => setLoading(false));
  }, [uploadId]);

  const current = questions[idx];

  const removeQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q._id !== id));
    setVerified(v => v + 1);
    setEditing(false);
    setIdx(i => Math.min(i, questions.length - 2));
  };

  const accept = async (id: string, updates?: Partial<BankQuestion>) => {
    setSaving(true);
    try {
      await bankApi.patchQuestion(id, { action: 'accept', ...updates });
      removeQuestion(id);
    } finally {
      setSaving(false);
    }
  };

  const reject = async (id: string) => {
    setSaving(true);
    try {
      await bankApi.patchQuestion(id, { action: 'reject' });
      removeQuestion(id);
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    setEditing(false);
    setIdx(i => (i + 1) % questions.length);
  };

  const bulkAcceptAll = async () => {
    if (!uploadId) return;
    setBulking(true);
    try {
      await bankApi.bulkAccept(uploadId);
      navigate('/bank');
    } finally {
      setBulking(false);
    }
  };

  const bulkAcceptSelected = async () => {
    setBulking(true);
    try {
      await Promise.all([...selected].map(id => bankApi.patchQuestion(id, { action: 'accept' })));
      setQuestions(prev => prev.filter(q => !selected.has(q._id)));
      setVerified(v => v + selected.size);
      setSelected(new Set());
    } finally {
      setBulking(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <Spinner className="w-6 h-6 text-accent-500" />
        </div>
      </Layout>
    );
  }

  if (questions.length === 0) {
    return (
      <Layout>
        <div className="px-8 py-8 max-w-2xl mx-auto text-center">
          <div className="card p-10">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">All done!</h2>
            <p className="text-slate-500 text-sm mb-6">
              {verified > 0 ? `You reviewed ${verified} question${verified !== 1 ? 's' : ''}.` : 'All questions were auto-accepted.'} They're now in your bank.
            </p>
            <button onClick={() => navigate('/bank')} className="btn-primary">Browse Question Bank</button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-8 py-8 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Verify Extracted Questions</h1>
            <p className="text-sm text-slate-500 mt-0.5">{questions.length} question{questions.length !== 1 ? 's' : ''} need your review</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-surface-100 rounded-card-inner p-0.5 border border-surface-200">
              {(['one-by-one', 'list'] as ViewMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-[6px] transition-all duration-150 focus-ring ${
                    mode === m ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {m === 'one-by-one' ? 'One by One' : 'List View'}
                </button>
              ))}
            </div>
            <button onClick={bulkAcceptAll} disabled={bulking} className="btn-secondary text-xs">
              {bulking ? <Spinner className="w-3.5 h-3.5" /> : 'Accept All'}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-2xs text-slate-400 mb-1.5">
            <span>Progress</span>
            <span>{verified} of {verified + questions.length} verified</span>
          </div>
          <div className="h-1.5 bg-surface-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-500 rounded-full transition-all duration-500"
              style={{ width: `${(verified / (verified + questions.length)) * 100}%` }}
            />
          </div>
        </div>

        {/* ONE-BY-ONE MODE */}
        {mode === 'one-by-one' && current && (
          <div className="card">
            {/* Question header */}
            <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2 flex-wrap">
              <TypeBadge type={current.questionType} />
              {current.subject && <span className="badge badge-slate">{current.subject}</span>}
              {current.class   && <span className="badge badge-slate">{current.class}</span>}
              {current.marks   && <span className="badge badge-slate">{current.marks} {current.marks === 1 ? 'mark' : 'marks'}</span>}
              <ConfidenceBadge value={current.confidence} />
              <span className="ml-auto text-2xs text-slate-400">{idx + 1} / {questions.length}</span>
            </div>

            {/* Question body */}
            <div className="px-5 py-5">
              {editing ? (
                <EditForm
                  question={current}
                  onSave={updates => accept(current._id, updates)}
                  onCancel={() => setEditing(false)}
                />
              ) : (
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{current.rawText}</p>
              )}
            </div>

            {/* Actions */}
            {!editing && (
              <div className="px-5 py-4 border-t border-surface-100 flex items-center gap-2">
                <p className="text-2xs text-slate-400 mr-auto">Reviewing questions from this upload — accept to add to bank.</p>
                <button onClick={() => setEditing(true)} className="btn-ghost">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  Edit
                </button>
                <button onClick={skip} className="btn-secondary text-xs">Skip</button>
                <button onClick={() => reject(current._id)} disabled={saving} className="btn-danger text-xs">
                  Reject
                </button>
                <button onClick={() => accept(current._id)} disabled={saving} className="btn-primary text-xs">
                  {saving ? <Spinner className="w-3.5 h-3.5" /> : null}
                  Accept
                </button>
              </div>
            )}
          </div>
        )}

        {/* LIST VIEW MODE */}
        {mode === 'list' && (
          <div className="space-y-2">
            {selected.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-3 bg-accent-50 border border-accent-200 rounded-card-inner mb-3">
                <span className="text-sm text-accent-700 font-medium">{selected.size} selected</span>
                <button onClick={bulkAcceptSelected} disabled={bulking} className="btn-primary text-xs ml-auto">
                  {bulking ? <Spinner className="w-3.5 h-3.5" /> : `Accept ${selected.size}`}
                </button>
                <button onClick={() => setSelected(new Set())} className="btn-ghost text-xs">Clear</button>
              </div>
            )}

            {questions.map(q => (
              <div
                key={q._id}
                className={`card px-4 py-4 flex items-start gap-3 transition-colors ${selected.has(q._id) ? 'border-accent-300 bg-accent-50/30' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(q._id)}
                  onChange={() => toggleSelect(q._id)}
                  className="mt-0.5 w-4 h-4 accent-[#4f46e5] cursor-pointer"
                  aria-label={`Select question`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <TypeBadge type={q.questionType} />
                    {q.marks && <span className="badge badge-slate">{q.marks}m</span>}
                    <ConfidenceBadge value={q.confidence} />
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed line-clamp-2">{q.rawText}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => reject(q._id)} className="btn-danger text-xs py-1 px-2">Reject</button>
                  <button onClick={() => accept(q._id)} className="btn-primary text-xs py-1 px-2">Accept</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
