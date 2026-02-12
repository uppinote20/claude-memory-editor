import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchRoute } from './routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const DEFAULT_PORT = 3456;
const MAX_PORT_ATTEMPTS = 10;

// Frontend files are embedded as strings during build (via esbuild define/loader)
// But we also support serving from dist/frontend/ for development
async function serveFrontendFile(filePath: string, res: ServerResponse): Promise<boolean> {
  // Map URL paths to actual files
  let actualPath: string;
  if (filePath === '/' || filePath === '/index.html') {
    actualPath = join(__dirname, 'frontend', 'index.html');
  } else if (filePath.startsWith('/assets/')) {
    actualPath = join(__dirname, 'frontend', filePath.slice(1)); // remove leading /
  } else {
    return false;
  }

  try {
    const content = await readFile(actualPath);
    const ext = extname(actualPath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method || 'GET';

  // CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Try API routes first
  const route = matchRoute(method, pathname);
  if (route) {
    await route.handler(req, res, route.params);
    return;
  }

  // Try serving frontend files
  if (method === 'GET') {
    const served = await serveFrontendFile(pathname, res);
    if (served) return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

function tryListen(port: number, attempt: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        await handleRequest(req, res);
      } catch (err) {
        console.error('Request error:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
        server.close();
        resolve(tryListen(port + 1, attempt + 1));
      } else {
        reject(err);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      resolve(port);
    });
  });
}

async function main(): Promise<void> {
  const envPort = process.env.MEMORY_EDITOR_PORT;
  const startPort = envPort ? parseInt(envPort, 10) : DEFAULT_PORT;

  try {
    const actualPort = await tryListen(startPort, 0);
    console.log(`Memory Editor running at http://127.0.0.1:${actualPort}`);
    // Output JSON for the command to parse
    console.log(JSON.stringify({ port: actualPort, url: `http://127.0.0.1:${actualPort}` }));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
