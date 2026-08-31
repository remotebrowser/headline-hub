import './server/instrument.js';

import * as Sentry from '@sentry/node';
import cors from 'cors';
import express from 'express';
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

declare module 'express-serve-static-core' {
  interface Request {
    sessionID: string;
  }
}

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

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

function readSessionIdFromCookie(req: express.Request): string | undefined {
  const cookieHeader = req.headers['cookie'];
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|; )session-id=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function requireSession(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const headerValue = req.headers['x-session-id'];
  const headerSessionId = Array.isArray(headerValue)
    ? headerValue[0]
    : headerValue;
  let sessionId = headerSessionId || readSessionIdFromCookie(req);

  // Auto-generate a session ID if none was provided
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    res.cookie('session-id', encodeURIComponent(sessionId), {
      path: '/',
      sameSite: 'lax',
    });
  }

  req.sessionID = sessionId;
  Sentry.getIsolationScope().setTag('mcp_session_id', sessionId);
  next();
}

// Health check
app.get('/health', (_req, res) => {
  const timestamp = new Date().toISOString();
  const gitRev = process.env.GIT_REV || 'unknown';
  res.type('text').send(`OK ${timestamp} GIT_REV: ${gitRev}`);
});

app.get('/api/sentry/config', (_, res) => {
  console.log('Sentry config:', settings.SENTRY_DSN, settings.ENVIRONMENT);
  res.json({
    dsn: settings.SENTRY_DSN,
    environment: settings.ENVIRONMENT,
  });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.get('/test-error', (_req, _res) => {
  throw new Error('Test error');
});

app.use('/api', requireSession);

app.get('/api/news-source', (_, res) => {
  res.json({
    success: true,
    data: newsSources.map((s) => ({ id: s.id, label: s.label })),
  });
});

// API Routes
app.get('/api/news', async (req, res) => {
  let browserId: string | undefined;
  let page: Page | undefined;
  let browser: Browser | undefined;
  try {
    const sessionId = req.sessionID;
    const xff = req.headers['x-forwarded-for'];
    const rawIp =
      xff && typeof xff === 'string'
        ? xff.split(',')[0].trim()
        : req.ip || req.connection.remoteAddress || 'unknown';
    const clientIp = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;
    const source = (req.query.source as string) || 'npr';
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
      'user-agent': req.headers['user-agent'],
      'sec-ch-ua': req.headers['sec-ch-ua'],
      'sec-ch-ua-mobile': req.headers['sec-ch-ua-mobile'],
      'sec-ch-ua-platform': req.headers['sec-ch-ua-platform'],
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

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    consola.error('Get News Error:', error as Error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
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

Sentry.setupExpressErrorHandler(app);

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction
  ) => {
    consola.error('Unhandled server error', err, {
      component: 'server',
      operation: 'fallback-error-handler',
      url: req.url,
      method: req.method,
    });

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// Serve static files only in production
if (process.env.NODE_ENV === 'production') {
  // Serve static files from dist directory (after API routes)
  app.use(express.static(path.join(__dirname, '..', 'dist')));

  // Catch-all handler: send back the app shell for any non-API, non-static routes
  app.use((req, res, next) => {
    // If it's an API route, let other handlers deal with it
    if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
      return next();
    }
    // For all other routes, serve the app shell
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}

function startServer() {
  try {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      if (process.env.NODE_ENV === 'production') {
        console.log('Serving static files from dist/');
      } else {
        console.log('API only mode - use Vite dev server for frontend');
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
