import { settings } from './config.js';

export async function createRemoteBrowser(
  headers?: Record<string, string>
): Promise<string> {
  const url = `${settings.REMOTEBROWSER_URL}/api/v1/browsers`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to create remote browser: ${response.status} ${response.statusText}`
    );
  }
  const { browser_id } = (await response.json()) as { browser_id: string };
  return browser_id;
}

export async function destroyRemoteBrowser(browserId: string): Promise<void> {
  const url = `${settings.REMOTEBROWSER_URL}/api/v1/browsers/${browserId}`;
  await fetch(url, { method: 'DELETE' });
}
