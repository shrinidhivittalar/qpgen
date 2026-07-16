import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext, createAuthState, useAuth } from './hooks/useAuth';
import type { Role } from './types';

import LoginPage         from './pages/LoginPage';
import RegisterPage      from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage     from './pages/DashboardPage';
import UploadPage        from './pages/UploadPage';
import VerifyPage        from './pages/VerifyPage';
import BankPage          from './pages/BankPage';

const ROLE_LANDING: Record<Role, string> = {
  teacher:   '/dashboard',
  hod:       '/dashboard',
  principal: '/dashboard',
  student:   '/dashboard',
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
      <div className="animate-spin h-8 w-8 rounded-full border-4 border-accent-600 border-t-transparent" />
    </div>
  );
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user) return <Navigate to={roleLandingPage(user.role)} replace />;
  return <>{children}</>;
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
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

          {/* App */}
          <Route path="/dashboard"        element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/upload"           element={<PrivateRoute><UploadPage /></PrivateRoute>} />
          <Route path="/verify/:uploadId" element={<PrivateRoute><VerifyPage /></PrivateRoute>} />
          <Route path="/bank"             element={<PrivateRoute><BankPage /></PrivateRoute>} />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
