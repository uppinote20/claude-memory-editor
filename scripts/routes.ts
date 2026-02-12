import { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { scanAllMemoryFiles, searchFiles } from './file-scanner.js';

type RouteHandler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void>;

const CLAUDE_DIR = resolve(homedir(), '.claude');

// Validate that the resolved path is strictly under ~/.claude/
// Prevents path traversal attacks (e.g., ~/.claude/../../etc/passwd)
function isPathAllowed(filePath: string): boolean {
  const resolved = resolve(filePath);
  return resolved.startsWith(CLAUDE_DIR + '/');
}

// For write operations, additionally require the path to be under a memory directory
function isWritePathAllowed(filePath: string): boolean {
  if (!isPathAllowed(filePath)) return false;
  const resolved = resolve(filePath);
  // Must be under ~/.claude/projects/*/memory/ and end with .md
  return /\.claude\/projects\/[^/]+\/memory\//.test(resolved) && resolved.endsWith('.md');
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  });
  res.end(JSON.stringify(data));
}

function error(res: ServerResponse, message: string, status = 500): void {
  json(res, { error: message }, status);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// GET /api/files - List all memory files
const listFiles: RouteHandler = async (_req, res) => {
  try {
    const tree = await scanAllMemoryFiles();
    json(res, tree);
  } catch (err) {
    error(res, `Failed to scan files: ${err}`);
  }
};

// GET /api/files/:encodedPath - Read a file
const readFileRoute: RouteHandler = async (_req, res, params) => {
  try {
    const filePath = decodeURIComponent(params.path);
    if (!isPathAllowed(filePath)) {
      error(res, 'Access denied: path must be under ~/.claude/', 403);
      return;
    }
    const content = await readFile(filePath, 'utf-8');
    json(res, { path: filePath, content });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      error(res, 'File not found', 404);
    } else {
      error(res, `Failed to read file: ${err}`);
    }
  }
};

// PUT /api/files/:encodedPath - Write a file
const writeFileRoute: RouteHandler = async (req, res, params) => {
  try {
    const filePath = decodeURIComponent(params.path);
    if (!isWritePathAllowed(filePath)) {
      error(res, 'Access denied: can only write to ~/.claude/projects/*/memory/*.md', 403);
      return;
    }
    const body = await readBody(req);
    const { content } = JSON.parse(body);
    if (typeof content !== 'string') {
      error(res, 'Missing content field', 400);
      return;
    }
    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
    json(res, { path: filePath, saved: true });
  } catch (err) {
    error(res, `Failed to write file: ${err}`);
  }
};

// GET /api/search?q=keyword - Search files
const searchRoute: RouteHandler = async (req, res) => {
  try {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const query = url.searchParams.get('q');
    if (!query || query.length < 2) {
      error(res, 'Query must be at least 2 characters', 400);
      return;
    }
    const results = await searchFiles(query);
    json(res, { results });
  } catch (err) {
    error(res, `Search failed: ${err}`);
  }
};

interface Route {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
  paramNames: string[];
}

const routes: Route[] = [
  {
    method: 'GET',
    pattern: /^\/api\/files$/,
    handler: listFiles,
    paramNames: [],
  },
  {
    method: 'GET',
    pattern: /^\/api\/files\/(.+)$/,
    handler: readFileRoute,
    paramNames: ['path'],
  },
  {
    method: 'PUT',
    pattern: /^\/api\/files\/(.+)$/,
    handler: writeFileRoute,
    paramNames: ['path'],
  },
  {
    method: 'GET',
    pattern: /^\/api\/search$/,
    handler: searchRoute,
    paramNames: [],
  },
];

export function matchRoute(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.pattern);
    if (match) {
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      return { handler: route.handler, params };
    }
  }
  return null;
}
