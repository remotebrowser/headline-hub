import { RemoteBrowser } from '@remotebrowser/sdk';
import { settings } from './config.js';

// The SDK requires an API key, but a local server runs without one. Strip the
// Authorization header in that case so the calls go out unauthenticated.
export const remoteBrowser = new RemoteBrowser({
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
