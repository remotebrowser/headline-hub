import toast from 'react-hot-toast';
import { HeadlineItem, NewsSourceItem } from './type.js';

const API_BASE_URL = '/api';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

// Module-level trace state - persists for the lifetime of the browser tab.
// All requests in a session share the same traceId so they appear under one trace in Logfire.
let sessionTraceId: string | null = null;

function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const traceHeaders: Record<string, string> = {};
    if (sessionTraceId) {
      traceHeaders['traceparent'] =
        `00-${sessionTraceId}-${generateSpanId()}-01`;
    }

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...traceHeaders,
        ...options.headers,
      },
      ...options,
    });

    // Sync sessionTraceId with the server-assigned value.
    // Also handles session expiry: if the server issues a new session, the new traceId replaces the stale one.
    const incomingTraceId = response.headers.get('X-Session-Trace-Id');
    if (incomingTraceId && incomingTraceId !== sessionTraceId) {
      sessionTraceId = incomingTraceId;
    }

    const result: ApiResponse<T> = await response.json();

    if (!response.ok) {
      const errorMessage = `HTTP ${response.status}: ${response.statusText} ${result.error}`;
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }

    if (!result.success) {
      const errorMessage = result.error || 'API request failed';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }

    return result.data as T;
  }

  async getNews(
    source: string,
    connection: string | null
  ): Promise<HeadlineItem[]> {
    const params = new URLSearchParams({ source });
    if (connection) {
      params.append('connection', connection);
    }
    return this.request<HeadlineItem[]>(`/news?${params.toString()}`, {
      method: 'GET',
    });
  }

  async getNewsSources(): Promise<NewsSourceItem[]> {
    return this.request<NewsSourceItem[]>(`/news-source`, {
      method: 'GET',
    });
  }
}

export const apiClient = new ApiClient();
