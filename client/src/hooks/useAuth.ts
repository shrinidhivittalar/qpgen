import { createContext, useContext, useEffect, useState } from 'react';
import type { User, RegisterData, Role } from '../types';
import { setAccessToken, clearTokens } from '../lib/auth';
import { api } from '../lib/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  role: Role | null;
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<User>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// AuthProvider is exported from here so it can be co-located with the hook.
// It is wired into the tree in App.tsx.
export function createAuthState() {
  // Internal hook — called once inside AuthProvider
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Silent refresh on boot to restore session from httpOnly cookie
    fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json() as { accessToken: string };
        setAccessToken(d.accessToken);
        const meRes = await api.get('/api/auth/me');
        if (meRes.ok) {
          const me = await meRes.json() as { user: User };
          setUser(me.user);
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    const res = await api.post('/api/auth/login', { email, password });
    if (!res.ok) {
      const err = await res.json() as { error: string };
      throw new Error(err.error);
    }
    const data = await res.json() as { user: User; accessToken: string };
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  };

  const register = async (data: RegisterData): Promise<User> => {
    const res = await api.post('/api/auth/register', data);
    if (!res.ok) {
      const err = await res.json() as { error: string };
      throw new Error(Array.isArray(err.error) ? 'Validation error' : err.error);
    }
    const body = await res.json() as { user: User; accessToken: string };
    setAccessToken(body.accessToken);
    setUser(body.user);
    return body.user;
  };

  const logout = async (): Promise<void> => {
    await api.post('/api/auth/logout').catch(() => null);
    clearTokens();
    setUser(null);
  };

  return {
    user,
    loading,
    role: user?.role ?? null,
    login,
    register,
    logout,
  };
}
