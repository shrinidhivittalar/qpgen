let _accessToken: string | null = null;

export function setAccessToken(token: string): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function clearTokens(): void {
  _accessToken = null;
}

// Decode JWT payload to read role for client-side routing ONLY.
// Never trust this for anything security-sensitive — the server re-verifies
// on every request (ROLE-02).
export function decodeRole(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return (payload.role as string) ?? '';
  } catch {
    return '';
  }
}
