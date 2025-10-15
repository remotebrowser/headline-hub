import './server/instrument.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { newsSources, settings } from './server/config.js';
import { getLocation } from './server/locationService.js';
import * as Sentry from '@sentry/node';
import { Logger } from './utils/logger.js';
import { HeadlineItem } from './type.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/sentry/config', (_, res) => {
  console.log('Sentry config:', settings.SENTRY_DSN, settings.NODE_ENV);
  res.json({
    dsn: settings.SENTRY_DSN,
    environment: settings.NODE_ENV,
  });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.get('/test-error', (_, res) => {
  throw new Error('Test error');
});

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
    const location = await getLocation(req);

    const mcpUrl = `${settings.GETGATHER_URL}/mcp-media/`;
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: {
        headers: {
          'x-location': location ? JSON.stringify(location) : '',
        },
      },
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

    const result = await client.callTool({
      name: newsSource.toolName,
    });

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

    const headlines = structuredContent?.[newsSource.dataKey].map((item) => ({
      ...item,
      link: `${newsSources.find((s) => s.id === source)?.linkPrefix}${item.link}`,
    }));

    res.json({
      success: true,
      data: headlines,
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
    next: express.NextFunction
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
