import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext, createAuthState, useAuth } from './hooks/useAuth';
import type { Role } from './types';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import ReviewPage from './pages/ReviewPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AssessmentPage from './pages/AssessmentPage';

const ROLE_LANDING: Record<Role, string> = {
  teacher:   '/dashboard',
  hod:       '/review',
  principal: '/analytics',
  student:   '/assessment',
};

export function roleLandingPage(role: Role): string {
  return ROLE_LANDING[role];
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = createAuthState();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 border-t-transparent" />
    </div>
  );
}

// Redirects authenticated users away from public pages to their landing page
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user) return <Navigate to={roleLandingPage(user.role)} replace />;
  return <>{children}</>;
}

// Guards a route by role. Wrong role → user's own landing page (not a 403).
function RoleRoute({ allowed, children }: { allowed: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed.includes(user.role)) return <Navigate to={roleLandingPage(user.role)} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login"           element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register"        element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />

          {/* Protected — one role per landing page */}
          <Route path="/dashboard" element={<RoleRoute allowed={['teacher']}><DashboardPage /></RoleRoute>} />
          <Route path="/review"    element={<RoleRoute allowed={['hod']}><ReviewPage /></RoleRoute>} />
          <Route path="/analytics" element={<RoleRoute allowed={['principal']}><AnalyticsPage /></RoleRoute>} />
          <Route path="/assessment"element={<RoleRoute allowed={['student']}><AssessmentPage /></RoleRoute>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
