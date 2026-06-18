import { customAlphabet } from 'nanoid';
import { settings } from './config.js';

const FRIENDLY_CHARS = '23456789abcdefghijkmnpqrstuvwxyz';
export const generateId = customAlphabet(FRIENDLY_CHARS, 7);

// A freshly created browser exposes its page and produces distilled content
// asynchronously, so the listing/navigate/distill endpoints are polled until
// they succeed. Mirrors the retry behaviour of the Remote Browser test suite.
const RETRY_ATTEMPTS = 30;
const RETRY_INTERVAL_MS = 1000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface BrowserPage {
  browserId: string;
  pageId: string;
}

export async function createRemoteBrowser(
  id: string,
  headers?: Record<string, string>
): Promise<void> {
  const url = `${settings.GETGATHER_URL}/api/v1/browsers/${id}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to create remote browser: ${response.status} ${response.statusText}`
    );
  }
}

export async function destroyRemoteBrowser(browserId: string): Promise<void> {
  const url = `${settings.GETGATHER_URL}/api/v1/browsers/${browserId}`;
  await fetch(url, { method: 'DELETE' });
}

/**
 * Resolves the page that the browser opened on startup. The browser begins
 * with a single blank page, so the pages listing is polled until one appears.
 */
export async function getPage(
  browserId: string,
  headers?: Record<string, string>
): Promise<BrowserPage> {
  const url = `${settings.GETGATHER_URL}/api/v1/browsers/${browserId}/pages`;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const response = await fetch(url, { method: 'GET', headers: headers || {} });
    if (response.ok) {
      const pageIds = (await response.json()) as unknown[];
      if (Array.isArray(pageIds) && pageIds.length > 0) {
        return { browserId, pageId: String(pageIds[0]) };
      }
    }
    await sleep(RETRY_INTERVAL_MS);
  }
  throw new Error(`No page became available for browser ${browserId}`);
}

export async function navigatePage(
  page: BrowserPage,
  url: string,
  headers?: Record<string, string>
): Promise<void> {
  const navigateUrl =
    `${settings.GETGATHER_URL}/api/v1/browsers/${page.browserId}` +
    `/pages/${page.pageId}/navigate?url=${encodeURIComponent(url)}`;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const response = await fetch(navigateUrl, {
      method: 'POST',
      headers: headers || {},
    });
    if (response.ok) {
      return;
    }
    await sleep(RETRY_INTERVAL_MS);
  }
  throw new Error(`Failed to navigate to ${url}`);
}

export async function distillPage(
  page: BrowserPage,
  headers?: Record<string, string>
): Promise<unknown> {
  const url = `${settings.GETGATHER_URL}/api/v1/browsers/${page.browserId}/pages/${page.pageId}/distilled`;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const response = await fetch(url, { method: 'GET', headers: headers || {} });
    if (response.ok) {
      return await response.json();
    }
    await sleep(RETRY_INTERVAL_MS);
  }
  throw new Error(`Failed to distill page for browser ${page.browserId}`);
}
