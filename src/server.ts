import './server/instrument.js';

import * as Sentry from '@sentry/node';
import cors from 'cors';
import express from 'express';
import { trace } from '@opentelemetry/api';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createRemoteBrowser,
  destroyRemoteBrowser,
  distillPage,
  getPage,
  navigatePage,
  uploadPatterns,
} from './server/remoteBrowser.js';
import { newsSources, settings } from './server/config.js';
import { HeadlineItem } from './type.js';
import { Logger } from './utils/logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    sessionID: string;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  const sessionId = headerSessionId || readSessionIdFromCookie(req);
  if (!sessionId) {
    res.status(400).json({ error: 'session-id is required' });
    return;
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

    await uploadPatterns();

    Logger.info('Creating remote browser', { source });
    browserId = await createRemoteBrowser(headers);

    const page = await getPage(browserId, headers);
    Logger.info('Navigating to', { browserId, url: newsSource.url });
    await navigatePage(page, newsSource.url, headers);

    const rawDistilled = await distillPage(page, headers);
    Logger.info('Got distilled content', {
      source,
      itemCount: Array.isArray(rawDistilled) ? rawDistilled.length : 0,
    });

    const data: HeadlineItem[] = Array.isArray(rawDistilled)
      ? rawDistilled.map((item: Record<string, unknown>): HeadlineItem => {
          const url = (item.url ?? item.href ?? item.link ?? '') as string;
          return {
            title: (item.title ?? item.text ?? item.name ?? '') as string,
            url: url.startsWith('/') ? new URL(url, newsSource.url).href : url,
          };
        })
      : [];

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    Logger.error('Get News Error:', error as Error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    if (browserId) {
      try {
        await destroyRemoteBrowser(browserId);
        Logger.info('Browser destroyed', { browserId });
      } catch (e) {
        Logger.error('Error destroying browser:', e as Error);
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
    Logger.error('Unhandled server error', err, {
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

  // Catch-all handler: send back React app for any non-API, non-static routes
  app.use((req, res, next) => {
    // If it's an API route, let other handlers deal with it
    if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
      return next();
    }
    // For all other routes, serve the React app
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}

async function startServer() {
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
