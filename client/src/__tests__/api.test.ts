/**
 * TC-ROLE-09: expired/missing access token → apiFetch intercepts 401,
 * calls /api/auth/refresh, stores the new token, then retries the
 * original request exactly once — which succeeds.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub window before importing api.ts so the redirect path doesn't throw
vi.stubGlobal('window', { location: { href: '' } });

import { apiFetch } from '../lib/api';
import { setAccessToken, getAccessToken, clearTokens } from '../lib/auth';

beforeEach(() => {
  clearTokens();
  vi.restoreAllMocks();
  // Restore window stub after restoreAllMocks in case it was cleared
  vi.stubGlobal('window', { location: { href: '' } });
});

describe('TC-ROLE-09: 401 → silent refresh → retry', () => {
  it('retries the original request after a successful refresh and attaches the new token', async () => {
    setAccessToken('expired-token');

    const mockFetch = vi
      .fn()
      // 1st: original request → 401
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      // 2nd: POST /api/auth/refresh → 200 with new token
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'fresh-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      // 3rd: original request retried → 200
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    vi.stubGlobal('fetch', mockFetch);

    const res = await apiFetch('/api/some/resource');

    expect(res.status).toBe(200);

    // refresh endpoint was called
    const calls = mockFetch.mock.calls as [string, RequestInit][];
    const refreshCall = calls.find(([url]) => url === '/api/auth/refresh');
    expect(refreshCall).toBeTruthy();
    expect(refreshCall![1].method).toBe('POST');

    // retry used the new token
    const retryHeaders = calls[2][1].headers as Record<string, string>;
    expect(retryHeaders['Authorization']).toBe('Bearer fresh-token');

    // in-memory token is updated
    expect(getAccessToken()).toBe('fresh-token');
  });

  it('clears tokens and redirects when refresh itself fails (session fully expired)', async () => {
    setAccessToken('expired-token');

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 })) // original → 401
      .mockResolvedValueOnce(new Response(null, { status: 401 })); // refresh → 401

    vi.stubGlobal('fetch', mockFetch);

    await expect(apiFetch('/api/some/resource')).rejects.toThrow('Session expired');

    expect(getAccessToken()).toBeNull();
    expect((window as { location: { href: string } }).location.href).toBe('/login');
  });

  it('does NOT retry more than once (isRetry flag prevents infinite loop)', async () => {
    setAccessToken('valid-token');

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 })) // original → 401
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'new-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ) // refresh → 200
      .mockResolvedValueOnce(new Response(null, { status: 401 })); // retry → 401 again

    vi.stubGlobal('fetch', mockFetch);

    const res = await apiFetch('/api/some/resource');
    expect(res.status).toBe(401); // returns the 401, does not retry again
    expect(mockFetch).toHaveBeenCalledTimes(3); // no 4th call
  });
});
