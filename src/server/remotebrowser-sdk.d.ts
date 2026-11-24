declare module '@remotebrowser/sdk' {
  interface RequestOptions {
    timeout?: number;
    maxRetries?: number;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  }

  export class RemoteBrowser {
    constructor(options?: {
      apiKey?: string;
      baseURL?: string;
      timeout?: number;
      maxRetries?: number;
      defaultHeaders?: Record<string, string>;
      fetch?: typeof fetch;
    });
    readonly authHeaders: Record<string, string>;
    readonly browsers: {
      create(
        params?: Record<string, unknown>,
        options?: RequestOptions
      ): Promise<{ browser_id: string; status: string }>;
      delete(id: string, options?: RequestOptions): Promise<unknown>;
      connectUrl(id: string): string;
    };
  }
}
