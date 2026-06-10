import './server/instrument.js';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { newsSources, settings } from './server/config.js';
import { getClientIp, getLocation } from './server/locationService.js';
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
  const match = cookieHeader.match(/(?:^|; )mcp-session-id=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function requireSession(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const headerValue = req.headers['x-mcp-session-id'];
  const headerSessionId = Array.isArray(headerValue)
    ? headerValue[0]
    : headerValue;
  const sessionId = headerSessionId || readSessionIdFromCookie(req);
  if (!sessionId) {
    res.status(400).json({ error: 'mcp-session-id is required' });
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
  const client = new Client(
    { name: 'headline-hub-server', version: '1.0.0' },
    { capabilities: {} }
  );
  try {
    const connection = (req.query['connection'] as string) || null;
    const sessionId = req.sessionID;
    const clientIp = getClientIp(req);
    const location = await getLocation(req);
    const _headers = {
      'x-forwarded-for': clientIp,
      'x-origin-ip': clientIp,
      'user-agent': req.headers['user-agent'],
      'sec-ch-ua': req.headers['sec-ch-ua'],
      'sec-ch-ua-mobile': req.headers['sec-ch-ua-mobile'],
      'sec-ch-ua-platform': req.headers['sec-ch-ua-platform'],
      Authorization: `Bearer ${settings.GETGATHER_APP_KEY}_${sessionId}`,
      'x-location': location ? JSON.stringify(location) : undefined,
      'x-proxy-type': connection || '',
    };
    const headers: HeadersInit = Object.entries(_headers)
      .filter(([, v]) => v != null)
      .map(
        ([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v] as [string, string]
      );

    const mcpUrl = `${settings.GETGATHER_URL}/mcp-media/`;
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      sessionId,
      requestInit: { headers },
    });
    Logger.info('Connecting to MCP Server', {
      mcpUrl,
      location,
    });
    await client.connect(transport);
    Logger.info('Connected to MCP Server');
    const source = (req.query.source as string) || 'npr';
    const newsSource = newsSources.find((s) => s.id === source);

    if (!newsSource) {
      throw new Error(`News source not found for source: ${source}`);
    }

    if (!newsSource.toolName) {
      throw new Error(`Tool name not found for source: ${source}`);
    }

    const result = await client.callTool(
      { name: newsSource.toolName },
      undefined, // skip the progress handler
      { timeout: 300000 } // set a custom timeout
    );

    Logger.info('Got response from MCP Server', {
      content: `${JSON.stringify(result).slice(0, 250)}...`,
    });

    if (result.isError) {
      res.status(500).json({
        success: false,
        error: JSON.stringify(result.content),
      });
      return;
    }

    const structuredContent = result.structuredContent as Record<
      string,
      HeadlineItem[]
    >;

    res.json({
      success: true,
      data: structuredContent?.[newsSource.dataKey],
    });
  } catch (error) {
    Logger.error('Get News Error:', error as Error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    Logger.info('Disconnecting from MCP Server');
    await client.close();
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

// Initialize MCP client and start server
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
    console.error('Failed to initialize MCP client:', error);
    process.exit(1);
  }
}

startServer();
