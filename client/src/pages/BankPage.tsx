import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/ui';
import { bankApi } from '../lib/api';
import type { BankQuestion, QuestionType } from '../types';
import { QUESTION_TYPE_LABELS, ALL_QUESTION_TYPES } from '../types';

interface Filters {
  subject:      string;
  class:        string;
  chapter:      string;
  questionType: string;
  marksMin:     string;
  marksMax:     string;
  search:       string;
}

const EMPTY_FILTERS: Filters = { subject: '', class: '', chapter: '', questionType: '', marksMin: '', marksMax: '', search: '' };

function TypeBadge({ type }: { type: string }) {
  return <span className="badge badge-indigo">{QUESTION_TYPE_LABELS[type as QuestionType] ?? type}</span>;
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export default function BankPage() {
  const navigate = useNavigate();
  const [filters,   setFilters]   = useState<Filters>(EMPTY_FILTERS);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [total,     setTotal]     = useState(0);
  const [pages,     setPages]     = useState(1);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());

  const load = useCallback(async (f: Filters, p: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, limit: 20 };
      if (f.subject)      params.subject      = f.subject;
      if (f.class)        params.class        = f.class;
      if (f.chapter)      params.chapter      = f.chapter;
      if (f.questionType) params.questionType = f.questionType;
      if (f.marksMin)     params.marksMin     = f.marksMin;
      if (f.marksMax)     params.marksMax     = f.marksMax;
      if (f.search)       params.search       = f.search;

      const data = await bankApi.questions(params) as { questions: BankQuestion[]; total: number; pages: number };
      setQuestions(data.questions);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filters, page); }, [filters, page, load]);

  const set = (key: keyof Filters, val: string) => {
    setFilters(prev => ({ ...prev, [key]: val }));
    setPage(1);
  };

  const clearAll = () => { setFilters(EMPTY_FILTERS); setPage(1); };

  const hasFilters = Object.values(filters).some(Boolean);

  const toggleExpand = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <Layout>
      <div className="flex h-full">
        {/* Filter sidebar */}
        <aside className="w-60 shrink-0 border-r border-surface-200 bg-white overflow-y-auto px-4 py-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Filters</h2>
            {hasFilters && (
              <button onClick={clearAll} className="text-2xs text-accent-600 hover:text-accent-800 font-medium focus-ring rounded">
                Clear all
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="form-label" htmlFor="f-subject">Subject</label>
              <input id="f-subject" className="form-input" placeholder="All subjects" value={filters.subject} onChange={e => set('subject', e.target.value)} />
            </div>
            <div>
              <label className="form-label" htmlFor="f-class">Class / Grade</label>
              <input id="f-class" className="form-input" placeholder="All classes" value={filters.class} onChange={e => set('class', e.target.value)} />
            </div>
            <div>
              <label className="form-label" htmlFor="f-chapter">Chapter / Topic</label>
              <input id="f-chapter" className="form-input" placeholder="All chapters" value={filters.chapter} onChange={e => set('chapter', e.target.value)} />
            </div>
          </div>

          {/* Question type checkboxes */}
          <div>
            <p className="form-label mb-2">Question Type</p>
            <div className="space-y-1.5">
              {ALL_QUESTION_TYPES.map(type => (
                <label key={type} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={filters.questionType === type}
                    onChange={e => set('questionType', e.target.checked ? type : '')}
                    className="w-3.5 h-3.5 accent-[#4f46e5] cursor-pointer"
                  />
                  <span className="text-xs text-slate-600 group-hover:text-slate-900 transition-colors">
                    {QUESTION_TYPE_LABELS[type]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Marks range */}
          <div>
            <p className="form-label mb-2">Marks</p>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" placeholder="Min"
                className="form-input text-center" value={filters.marksMin}
                onChange={e => set('marksMin', e.target.value)}
              />
              <span className="text-slate-400 text-xs shrink-0">–</span>
              <input
                type="number" min="0" placeholder="Max"
                className="form-input text-center" value={filters.marksMax}
                onChange={e => set('marksMax', e.target.value)}
              />
            </div>
          </div>
        </aside>

        {/* Main area */}
        <div className="flex-1 overflow-y-auto">
          {/* Search bar + header */}
          <div className="sticky top-0 z-10 bg-surface-50 border-b border-surface-200 px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <SearchIcon />
                </span>
                <input
                  className="form-input pl-9 bg-white"
                  placeholder="Search questions..."
                  value={filters.search}
                  onChange={e => set('search', e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-slate-400">
                  {loading ? '…' : `${total.toLocaleString()} question${total !== 1 ? 's' : ''}`}
                </span>
                <button onClick={() => navigate('/upload')} className="btn-primary text-xs">
                  + Upload Paper
                </button>
              </div>
            </div>
          </div>

          {/* Questions list */}
          <div className="px-6 py-5 space-y-3">
            {loading ? (
              <div className="flex justify-center py-16">
                <Spinner className="w-6 h-6 text-accent-500" />
              </div>
            ) : questions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-full bg-surface-100 flex items-center justify-center text-slate-300 mb-3">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-500 mb-1">
                  {hasFilters ? 'No questions match these filters' : 'Your bank is empty'}
                </p>
                <p className="text-xs text-slate-400 mb-4">
                  {hasFilters ? 'Try clearing some filters.' : 'Upload a past paper to get started.'}
                </p>
                {!hasFilters && (
                  <button onClick={() => navigate('/upload')} className="btn-primary text-xs">Upload Past Paper</button>
                )}
                {hasFilters && (
                  <button onClick={clearAll} className="btn-secondary text-xs">Clear Filters</button>
                )}
              </div>
            ) : (
              questions.map(q => {
                const isExpanded = expanded.has(q._id);
                const truncated  = q.rawText.length > 180 && !isExpanded;
                return (
                  <div key={q._id} className="card px-5 py-4">
                    {/* Tags row */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      <TypeBadge type={q.questionType} />
                      {q.subject    && <span className="badge badge-slate">{q.subject}</span>}
                      {q.class      && <span className="badge badge-slate">{q.class}</span>}
                      {q.chapter    && <span className="badge badge-slate">{q.chapter}</span>}
                      {q.marks != null && (
                        <span className="badge badge-slate ml-auto shrink-0">{q.marks} {q.marks === 1 ? 'mark' : 'marks'}</span>
                      )}
                    </div>

                    {/* Question text */}
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {truncated ? q.rawText.slice(0, 180) + '…' : q.rawText}
                    </p>
                    {q.rawText.length > 180 && (
                      <button
                        onClick={() => toggleExpand(q._id)}
                        className="text-2xs text-accent-600 hover:text-accent-800 mt-1.5 font-medium focus-ring rounded"
                      >
                        {isExpanded ? 'Show less' : 'Show more'}
                      </button>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-100">
                      <span className="text-2xs text-slate-400">
                        {q.sourceYear ? `From ${q.sourceYear}` : 'Past paper'}
                      </span>
                      <button
                        disabled
                        title="Coming in Module 3"
                        className="btn-primary text-xs ml-auto opacity-40 cursor-not-allowed"
                        aria-disabled="true"
                      >
                        + Add to Paper
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* Pagination */}
            {pages > 1 && !loading && (
              <div className="flex items-center justify-center gap-1 pt-4">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-30"
                  aria-label="Previous page"
                >
                  ‹ Prev
                </button>
                {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-card-inner text-xs font-medium transition-colors focus-ring ${
                        p === page ? 'bg-accent-600 text-white' : 'btn-secondary'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(pages, p + 1))}
                  disabled={page === pages}
                  className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-30"
                  aria-label="Next page"
                >
                  Next ›
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
