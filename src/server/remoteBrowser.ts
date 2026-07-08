import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { settings } from './config.js';
import { consola } from 'consola';

const REMOTE_BROWSER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PATTERNS_DIR = path.join(REMOTE_BROWSER_DIR, 'patterns');

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

/**
 * Resolves the page that the browser opened on startup. The browser begins
 * with a single blank page, so the pages listing is polled until one appears.
 */
export async function getPage(
  browserId: string,
  headers?: Record<string, string>
): Promise<BrowserPage> {
  const url = `${settings.REMOTEBROWSER_URL}/api/v1/browsers/${browserId}/pages`;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      method: 'GET',
      headers: headers || {},
    });
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
    `${settings.REMOTEBROWSER_URL}/api/v1/browsers/${page.browserId}` +
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
  const url = `${settings.REMOTEBROWSER_URL}/api/v1/browsers/${page.browserId}/pages/${page.pageId}/distilled`;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      method: 'GET',
      headers: headers || {},
    });
    if (response.ok) {
      return await response.json();
    }
    await sleep(RETRY_INTERVAL_MS);
  }
  throw new Error(`Failed to distill page for browser ${page.browserId}`);
}

export async function uploadPatterns(): Promise<void> {
  const files = readdirSync(PATTERNS_DIR)
    .sort()
    .filter((file) => {
      const ext = path.extname(file).slice(1);
      return ext === 'html' || ext === 'json';
    });
  for (const file of files) {
    const ext = path.extname(file).slice(1);
    const name = path.basename(file, `.${ext}`);
    const content = readFileSync(path.join(PATTERNS_DIR, file), 'utf8');
    const url =
      `${settings.REMOTEBROWSER_URL}/api/v1/patterns/` +
      `${encodeURIComponent(name)}?ext=${ext}`;
    const startedAt = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const elapsedMs = Date.now() - startedAt;
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      consola.error(
        `Failed to upload pattern ${file}`,
        new Error(`${response.status} ${response.statusText} ${errorText}`),
        {
          component: 'remoteBrowser',
          operation: 'uploadPattern',
          elapsedMs,
        }
      );
      throw new Error(
        `Failed to upload pattern ${file}: ${response.status} ${response.statusText}`
      );
    }
    const result = (await response.json().catch(() => ({}))) as {
      status?: string;
    };
    const { status } = result;
    consola.success(`Uploaded pattern ${file}`, { file, elapsedMs, status });
  }
}
