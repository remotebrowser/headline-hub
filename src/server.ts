import './server/instrument.js';

import * as Sentry from '@sentry/node';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie } from 'hono/cookie';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { trace } from '@opentelemetry/api';
import path from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import {
  createRemoteBrowser,
  destroyRemoteBrowser,
} from './server/remoteBrowser.js';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { convert, distill, parse, patternsDir } from './server/distill.js';
import type { PatternEntry } from './server/distill.js';
import { newsSources, settings } from './server/config.js';
import { consola } from 'consola';

type HeadlineItem = {
  title: string;
  url: string;
};

type Variables = {
  sessionID: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const patterns: PatternEntry[] = readdirSync(patternsDir)
  .map((file) => path.join(patternsDir, file))
  .filter((name) => {
    const st = statSync(name);
    return st && !st.isDirectory();
  })
  .filter((name) => name.endsWith('.html'))
  .map((name) => {
    const content = readFileSync(name, 'utf-8');
    const pattern = parse(content);
    return { name, pattern };
  });

const NAV_RETRY_ATTEMPTS = 30;
const NAV_RETRY_INTERVAL_MS = 1000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const navigatePage = async (page: Page, url: string): Promise<void> => {
  for (let attempt = 0; attempt < NAV_RETRY_ATTEMPTS; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return;
    } catch (err) {
      consola.warn('Navigation attempt failed, retrying...', {
        attempt,
        err: (err as Error).message,
      });
    }
    await sleep(NAV_RETRY_INTERVAL_MS);
  }
  throw new Error(`Failed to navigate to ${url}`);
};

const getCdpUrl = (browserId: string): string => {
  const baseUrl = settings.REMOTEBROWSER_URL.replace(/\/+$/, '');
  const protocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
  return (
    baseUrl.replace(/^https?:\/\//, `${protocol}://`) +
    `/api/v1/browsers/${browserId}/cdp`
  );
};

const getBrowser = async (browserId: string): Promise<Browser> => {
  return await chromium.connectOverCDP(getCdpUrl(browserId));
};

const getPage = async (browser: Browser): Promise<Page> => {
  const [context] = browser.contexts();
  const pages = context.pages();
  return pages.length > 0 ? pages[0] : await context.newPage();
};

const app = new Hono<{ Variables: Variables }>();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());

// Session middleware
app.use('/api/*', async (c: Context<{ Variables: Variables }>, next: Next) => {
  const headerSessionId = c.req.header('x-session-id');
  let sessionId = headerSessionId || getCookie(c, 'session-id');

  // Auto-generate a session ID if none was provided
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    setCookie(c, 'session-id', encodeURIComponent(sessionId), {
      path: '/',
      sameSite: 'lax',
    });
  }

  c.set('sessionID', sessionId);
  Sentry.getIsolationScope().setTag('mcp_session_id', sessionId);
  await next();
});

// Health check
app.get('/health', (c) => {
  const timestamp = new Date().toISOString();
  const gitRev = process.env.GIT_REV || 'unknown';
  return c.text(`OK ${timestamp} GIT_REV: ${gitRev}`);
});

app.get('/api/sentry/config', (c) => {
  console.log('Sentry config:', settings.SENTRY_DSN, settings.ENVIRONMENT);
  return c.json({
    dsn: settings.SENTRY_DSN,
    environment: settings.ENVIRONMENT,
  });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.get('/test-error', (_c) => {
  throw new Error('Test error');
});

app.get('/api/news-source', (c) => {
  return c.json({
    success: true,
    data: newsSources.map((s) => ({ id: s.id, label: s.label })),
  });
});

// API Routes
app.get('/api/news', async (c) => {
  let browserId: string | undefined;
  let page: Page | undefined;
  let browser: Browser | undefined;
  try {
    const sessionId = c.get('sessionID');
    const xff = c.req.header('x-forwarded-for');
    const rawIp =
      xff
        ? xff.split(',')[0].trim()
        : 'unknown';
    const clientIp = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;
    const source = c.req.query('source') || 'npr';
    const newsSource = newsSources.find((s) => s.id === source);

    const span = trace.getActiveSpan();
    if (newsSource) {
      span?.setAttribute('news.source.url', newsSource.url);
      span?.updateName(`GET /api/news (${newsSource.label})`);
    }

    if (!newsSource) {
      throw new Error(`News source not found for source: ${source}`);
    }

    const _headers: Record<string, string | string[] | undefined> = {
      Authorization: `Bearer ${settings.REMOTEBROWSER_APP_KEY}_${sessionId}`,
      'x-origin-ip': clientIp,
      'user-agent': c.req.header('user-agent'),
      'sec-ch-ua': c.req.header('sec-ch-ua'),
      'sec-ch-ua-mobile': c.req.header('sec-ch-ua-mobile'),
      'sec-ch-ua-platform': c.req.header('sec-ch-ua-platform'),
    };
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(_headers)) {
      if (v != null) {
        headers[k] = Array.isArray(v) ? v.join(', ') : v;
      }
    }

    const hostname = new URL(newsSource.url).hostname;

    consola.start('Creating remote browser', { source });
    browserId = await createRemoteBrowser(headers);

    browser = await getBrowser(browserId);
    page = await getPage(browser);
    consola.start('Navigating to', { browserId, url: newsSource.url });
    await navigatePage(page, newsSource.url);

    const match = await distill(hostname, patterns, page);
    if (!match) {
      throw new Error('No matching pattern found for the page');
    }
    consola.success('Got distilled pattern', {
      source,
      name: match.name,
      priority: match.priority,
    });

    const converted = await convert(match.distilled, patternsDir);
    const itemCount = converted.length;
    consola.success('Converted content', { source, itemCount });

    const data: HeadlineItem[] = converted.map(
      (item: Record<string, string>): HeadlineItem => {
        const url = (item.url ?? item.href ?? item.link ?? '') as string;
        return {
          title: (item.title ?? item.text ?? item.name ?? '') as string,
          url: url.startsWith('/') ? new URL(url, newsSource.url).href : url,
        };
      }
    );

    return c.json({
      success: true,
      data,
    });
  } catch (error) {
    consola.error('Get News Error:', error as Error);
    Sentry.captureException(error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  } finally {
    if (browser) {
      try {
        await browser.close();
        consola.info('Playwright browser disconnected', { browserId });
      } catch (e) {
        consola.error('Error closing Playwright browser:', e as Error);
      }
    }
    if (browserId) {
      try {
        await destroyRemoteBrowser(browserId);
        consola.info('Browser destroyed', { browserId });
      } catch (e) {
        consola.error('Error destroying browser:', e as Error);
      }
    }
  }
});

// Global error handler
app.onError((err, c) => {
  consola.error('Unhandled server error', err, {
    component: 'server',
    operation: 'fallback-error-handler',
    url: c.req.url,
    method: c.req.method,
  });

  Sentry.captureException(err);

  return c.json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString(),
  }, 500);
});

// Serve static files only in production
if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '..', 'dist');

  // Serve static assets (JS, CSS, images, etc.)
  app.use('/static-assets/*', serveStatic({ root: distDir }));
  app.use('/favicon.svg', serveStatic({ root: distDir }));
  app.use('/favicon.ico', serveStatic({ root: distDir }));
  app.use('/main.js', serveStatic({ root: distDir }));

  // SPA fallback: serve index.html for any non-API, non-static route
  app.get('*', (c) => {
    // Skip API and health routes (they're handled above)
    if (c.req.path.startsWith('/api/') || c.req.path === '/health') {
      return c.notFound();
    }
    try {
      const html = readFileSync(path.join(distDir, 'index.html'), 'utf-8');
      return c.html(html);
    } catch {
      return c.notFound();
    }
  });
}

serve(
  {
    fetch: app.fetch,
    port: Number(PORT),
  },
  (info) => {
    console.log(`Server running on port ${info.port}`);
    if (process.env.NODE_ENV === 'production') {
      console.log('Serving static files from dist/');
    } else {
      console.log('API only mode - use Vite dev server for frontend');
    }
  }
);
