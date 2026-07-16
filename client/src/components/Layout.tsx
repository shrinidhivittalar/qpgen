import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function IconGrid({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconLayers({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  );
}
function IconFile({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function IconSettings({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

const NAV = [
  { label: 'Dashboard',     path: '/dashboard', Icon: IconGrid },
  { label: 'Question Bank', path: '/bank',       Icon: IconLayers },
  { label: 'My Papers',     path: null,          Icon: IconFile,     soon: true },
  { label: 'Settings',      path: null,          Icon: IconSettings, soon: true },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  const initial = user?.name?.[0]?.toUpperCase() ?? 'T';

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Dark sidebar */}
      <aside className="w-60 shrink-0 bg-slate-900 flex flex-col" aria-label="Main navigation">
        {/* Logo */}
        <div className="px-5 py-[18px] border-b border-slate-800 flex items-center gap-2.5">
          <div className="w-7 h-7 bg-accent-600 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M12 3L2 8l10 5 10-5-10-5z" /><path d="M2 8v8l10 5 10-5V8" />
            </svg>
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">Question Bank</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label="Sidebar">
          {NAV.map(({ label, path, Icon, soon }) => {
            const active = path && (pathname === path || (path !== '/dashboard' && pathname.startsWith(path)));
            if (!path) {
              return (
                <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 cursor-not-allowed select-none" aria-disabled="true">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-sm flex-1">{label}</span>
                  {soon && <span className="text-2xs bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full">Soon</span>}
                </div>
              );
            }
            return (
              <Link
                key={label}
                to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 focus-ring ${
                  active ? 'bg-accent-600 text-white' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-4 py-4 border-t border-slate-800">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-full bg-accent-700 flex items-center justify-center text-white text-xs font-bold shrink-0" aria-hidden="true">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-slate-200 text-xs font-medium truncate">{user?.name}</p>
              <p className="text-slate-500 text-2xs capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="text-slate-500 hover:text-slate-300 text-xs transition-colors duration-150 focus-ring rounded"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto bg-surface-50">
        {children}
      </main>
    </div>
  );
}
