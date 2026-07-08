// ─────────────────────────────────────────────────────────────────────────────
// Shared UI primitives
// All components are intentionally small and composable.
// ─────────────────────────────────────────────────────────────────────────────
import { ReactNode } from 'react';

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin shrink-0 text-current`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
interface CardProps {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}
export function Card({ children, className = '', accent = false }: CardProps) {
  return (
    <div className={`${accent ? 'card-accent' : 'card'} ${className}`}>
      {children}
    </div>
  );
}

// ── CardHeader ────────────────────────────────────────────────────────────────
interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}
export function CardHeader({ title, subtitle, action, icon }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-surface-100">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <span className="shrink-0 w-7 h-7 rounded-card-inner bg-surface-100 flex items-center justify-center text-slate-500">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800 leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5 leading-tight">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── SectionStep ──────────────────────────────────────────────────────────────
interface SectionStepProps {
  step: number;
  title: string;
  children: ReactNode;
}
export function SectionStep({ step, title, children }: SectionStepProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="w-6 h-6 rounded-full bg-accent-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
          {step}
        </span>
        <h2 className="section-heading">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center text-slate-400 mb-3">
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-600 mb-1">{title}</p>
      <p className="text-xs text-slate-400 max-w-48 leading-relaxed">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── WeightBar ─────────────────────────────────────────────────────────────────
export function WeightBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct   = Math.min(100, (value / max) * 100);
  const ok    = value >= 95 && value <= 105;
  const over  = value > 105;
  const color = ok ? 'bg-emerald-500' : over ? 'bg-rose-500' : 'bg-amber-400';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-surface-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-2xs font-semibold tabular-nums ${ok ? 'text-emerald-600' : over ? 'text-rose-600' : 'text-amber-600'}`}>
        {value}%
      </span>
    </div>
  );
}

// ── InlineAlert ───────────────────────────────────────────────────────────────
type AlertVariant = 'warning' | 'error' | 'info' | 'success';
const ALERT_STYLES: Record<AlertVariant, string> = {
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  error:   'bg-rose-50  border-rose-200  text-rose-800',
  info:    'bg-accent-50 border-accent-200 text-accent-800',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
};
export function InlineAlert({ variant, children }: { variant: AlertVariant; children: ReactNode }) {
  return (
    <div className={`rounded-card-inner border px-3 py-2.5 text-xs leading-relaxed ${ALERT_STYLES[variant]}`}>
      {children}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider() {
  return <hr className="border-surface-100" />;
}
