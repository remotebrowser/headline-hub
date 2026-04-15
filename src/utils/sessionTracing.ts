const STORAGE_KEY = 'otel_trace_id';

let fallbackTraceId: string | null = null;

function generateHexId(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getSessionTraceId(): string {
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const traceId = generateHexId(16);
    sessionStorage.setItem(STORAGE_KEY, traceId);
    return traceId;
  } catch {
    if (!fallbackTraceId) {
      fallbackTraceId = generateHexId(16);
    }
    return fallbackTraceId;
  }
}

