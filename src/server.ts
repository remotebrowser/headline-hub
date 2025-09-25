import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { settings } from './server/config.js';
import { getLocation } from './server/locationService.js';

dotenv.config();

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

// API Routes
app.get('/api/news', async (req, res) => {
  try {
    const location = await getLocation(req);

    const client = new Client(
      { name: 'headline-hub-server', version: '1.0.0' },
      { capabilities: {} }
    );

    const transport = new StreamableHTTPClientTransport(
      new URL(`${settings.MCP_GETGATHER_URL}/mcp/`),
      {
        requestInit: {
          headers: {
            'x-incognito': '1',
            'x-location': location ? JSON.stringify(location) : '',
          },
        },
      }
    );

    await client.connect(transport);

    const result = await client.callTool({
      name: 'npr_get_headlines',
    });

    res.json({
      success: true,
      data: result.structuredContent,
    });
  } catch (error) {
    console.error('Get News Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

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
