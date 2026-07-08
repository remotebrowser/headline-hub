export function getSessionId(): string | null {
  const match = document.cookie.match(/(?:^|; )session-id=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function resetSession(): string {
  const id = crypto.randomUUID();
  document.cookie = `session-id=${encodeURIComponent(id)}; path=/; SameSite=Lax`;
  return id;
}

export function getSessionHeaders(): Record<string, string> {
  const id = getSessionId();
  return id ? { 'x-session-id': id } : {};
}

resetSession();
