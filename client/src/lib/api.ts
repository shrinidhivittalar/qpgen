import { getAccessToken, setAccessToken, clearTokens } from './auth';

// Deduplicates concurrent 401→refresh races so we never make two refresh
// calls simultaneously.
let pendingRefresh: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  if (!pendingRefresh) {
    pendingRefresh = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (r) => {
        if (!r.ok) return null;
        const d = await r.json() as { accessToken: string };
        setAccessToken(d.accessToken);
        return d.accessToken;
      })
      .catch(() => null)
      .finally(() => { pendingRefresh = null; });
  }
  return pendingRefresh;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<Response> {
  const token = getAccessToken();

  // Don't set Content-Type for FormData — the browser must set it with the
  // multipart boundary. Forcing application/json breaks multer on the server.
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> | undefined),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(path, { ...options, headers, credentials: 'include' });

  if (res.status === 401 && !isRetry) {
    const newToken = await doRefresh();
    if (newToken) {
      return apiFetch(path, options, true);
    }
    clearTokens();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  return res;
}

export const api = {
  get:    (path: string) =>
    apiFetch(path),
  post:   (path: string, body?: unknown) =>
    apiFetch(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put:    (path: string, body?: unknown) =>
    apiFetch(path, { method: 'PUT',  body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch:  (path: string, body?: unknown) =>
    apiFetch(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: (path: string) =>
    apiFetch(path, { method: 'DELETE' }),
};
