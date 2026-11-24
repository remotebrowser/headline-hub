import { RemoteBrowser } from '@remotebrowser/sdk';
import { settings } from './config.js';

// The SDK requires an API key, but a local server runs without one. Strip the
// Authorization header in that case so the calls go out unauthenticated.
const client = new RemoteBrowser({
  apiKey: settings.REMOTEBROWSER_API_KEY || 'unset',
  baseURL: settings.REMOTEBROWSER_URL,
  fetch: (input, init) => {
    if (settings.REMOTEBROWSER_API_KEY) {
      return fetch(input, init);
    }
    const headers = new Headers(init?.headers);
    headers.delete('Authorization');
    return fetch(input, { ...init, headers });
  },
});

export function remoteBrowserAuthHeaders(): Record<string, string> {
  return settings.REMOTEBROWSER_API_KEY ? client.authHeaders : {};
}

export function remoteBrowserConnectUrl(browserId: string): string {
  return client.browsers.connectUrl(browserId);
}

export async function createRemoteBrowser(
  headers?: Record<string, string>
): Promise<string> {
  // No retries: a retry after a lost response would leak a running browser.
  const { browser_id } = await client.browsers.create(
    {},
    { headers, maxRetries: 0 }
  );
  return browser_id;
}

export async function destroyRemoteBrowser(browserId: string): Promise<void> {
  try {
    await client.browsers.delete(browserId, { timeout: 10_000 });
  } catch (err) {
    if (!(err instanceof RemoteBrowser.NotFoundError)) {
      throw err;
    }
  }
}
