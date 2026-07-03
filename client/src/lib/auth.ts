const TOKEN_KEY = 'dev_access_token';

export function setAccessToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function clearTokens(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function decodeRole(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return (payload.role as string) ?? '';
  } catch {
    return '';
  }
}
