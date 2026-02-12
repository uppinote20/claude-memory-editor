#!/usr/bin/env node

// scripts/server.ts
import { createServer } from "node:http";
import { readFile as readFile3 } from "node:fs/promises";
import { join as join2, extname, dirname as dirname2 } from "node:path";
import { fileURLToPath } from "node:url";

// scripts/routes.ts
import { readFile as readFile2, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir as homedir2 } from "node:os";

// scripts/file-scanner.ts
import { readdir, stat, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { homedir } from "node:os";
function encodeName(name) {
  return name.replace(/[\/\.~_\- ]|[^\x20-\x7E]/g, "-");
}
async function resolveProjectPath(encoded) {
  const remaining = encoded.startsWith("-") ? encoded.slice(1) : encoded;
  return resolveStep("/", remaining);
}
async function resolveStep(current, remaining) {
  if (!remaining) return current;
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return null;
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const enc = encodeName(entry.name);
    if (remaining.startsWith(enc)) {
      candidates.push({ name: entry.name, encodedLen: enc.length });
    }
  }
  candidates.sort((a, b) => b.encodedLen - a.encodedLen);
  for (const c of candidates) {
    const rest = remaining.slice(c.encodedLen);
    if (rest === "") {
      return join(current, c.name);
    }
    if (rest.startsWith("-")) {
      const result = await resolveStep(join(current, c.name), rest.slice(1));
      if (result) return result;
    }
  }
  return null;
}
function extractProjectName(resolvedPath, encodedDir) {
  if (resolvedPath) {
    const parts = resolvedPath.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return parts.slice(-2).join("/");
    }
    return parts[parts.length - 1] || encodedDir;
  }
  return encodedDir;
}
async function dirExists(path) {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
async function scanMemoryDir(memoryDir, projectEncoded) {
  const files = [];
  const resolvedPath = await resolveProjectPath(projectEncoded);
  const projectPath = resolvedPath || projectEncoded;
  const projectName = extractProjectName(resolvedPath, projectEncoded);
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const s = await stat(fullPath);
          files.push({
            path: fullPath,
            projectName,
            projectPath,
            fileName: relative(memoryDir, fullPath),
            type: "auto-memory",
            lastModified: s.mtime.toISOString(),
            size: s.size
          });
        } catch {
        }
      }
    }
  }
  await walk(memoryDir);
  return files;
}
async function scanAllMemoryFiles() {
  const claudeDir = join(homedir(), ".claude", "projects");
  const files = [];
  if (!await dirExists(claudeDir)) {
    return { files };
  }
  let projectDirs;
  try {
    projectDirs = await readdir(claudeDir, { withFileTypes: true });
  } catch {
    return { files };
  }
  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue;
    const memoryDir = join(claudeDir, dir.name, "memory");
    if (await dirExists(memoryDir)) {
      const memoryFiles = await scanMemoryDir(memoryDir, dir.name);
      files.push(...memoryFiles);
    }
  }
  files.sort((a, b) => {
    const cmp = a.projectName.localeCompare(b.projectName);
    if (cmp !== 0) return cmp;
    return a.fileName.localeCompare(b.fileName);
  });
  return { files };
}
async function searchFiles(query) {
  const { files } = await scanAllMemoryFiles();
  const results = [];
  const lowerQuery = query.toLowerCase();
  for (const file of files) {
    try {
      const content = await readFile(file.path, "utf-8");
      const lines = content.split("\n");
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        const lowerLine = lines[i].toLowerCase();
        const idx = lowerLine.indexOf(lowerQuery);
        if (idx !== -1) {
          matches.push({
            line: i + 1,
            text: lines[i],
            highlight: [idx, idx + query.length]
          });
        }
      }
      if (matches.length > 0) {
        results.push({ file, matches });
      }
    } catch {
    }
  }
  return results;
}

// scripts/routes.ts
var CLAUDE_DIR = resolve(homedir2(), ".claude");
function isPathAllowed(filePath) {
  const resolved = resolve(filePath);
  return resolved.startsWith(CLAUDE_DIR + "/");
}
function isWritePathAllowed(filePath) {
  if (!isPathAllowed(filePath)) return false;
  const resolved = resolve(filePath);
  return /\.claude\/projects\/[^/]+\/memory\//.test(resolved) && resolved.endsWith(".md");
}
function json(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache"
  });
  res.end(JSON.stringify(data));
}
function error(res, message, status = 500) {
  json(res, { error: message }, status);
}
async function readBody(req) {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve2(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
var listFiles = async (_req, res) => {
  try {
    const tree = await scanAllMemoryFiles();
    json(res, tree);
  } catch (err) {
    error(res, `Failed to scan files: ${err}`);
  }
};
var readFileRoute = async (_req, res, params) => {
  try {
    const filePath = decodeURIComponent(params.path);
    if (!isPathAllowed(filePath)) {
      error(res, "Access denied: path must be under ~/.claude/", 403);
      return;
    }
    const content = await readFile2(filePath, "utf-8");
    json(res, { path: filePath, content });
  } catch (err) {
    if (err.code === "ENOENT") {
      error(res, "File not found", 404);
    } else {
      error(res, `Failed to read file: ${err}`);
    }
  }
};
var writeFileRoute = async (req, res, params) => {
  try {
    const filePath = decodeURIComponent(params.path);
    if (!isWritePathAllowed(filePath)) {
      error(res, "Access denied: can only write to ~/.claude/projects/*/memory/*.md", 403);
      return;
    }
    const body = await readBody(req);
    const { content } = JSON.parse(body);
    if (typeof content !== "string") {
      error(res, "Missing content field", 400);
      return;
    }
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
    json(res, { path: filePath, saved: true });
  } catch (err) {
    error(res, `Failed to write file: ${err}`);
  }
};
var searchRoute = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const query = url.searchParams.get("q");
    if (!query || query.length < 2) {
      error(res, "Query must be at least 2 characters", 400);
      return;
    }
    const results = await searchFiles(query);
    json(res, { results });
  } catch (err) {
    error(res, `Search failed: ${err}`);
  }
};
var routes = [
  {
    method: "GET",
    pattern: /^\/api\/files$/,
    handler: listFiles,
    paramNames: []
  },
  {
    method: "GET",
    pattern: /^\/api\/files\/(.+)$/,
    handler: readFileRoute,
    paramNames: ["path"]
  },
  {
    method: "PUT",
    pattern: /^\/api\/files\/(.+)$/,
    handler: writeFileRoute,
    paramNames: ["path"]
  },
  {
    method: "GET",
    pattern: /^\/api\/search$/,
    handler: searchRoute,
    paramNames: []
  }
];
function matchRoute(method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.pattern);
    if (match) {
      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      return { handler: route.handler, params };
    }
  }
  return null;
}

// scripts/server.ts
var __dirname = dirname2(fileURLToPath(import.meta.url));
var MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};
var DEFAULT_PORT = 3456;
var MAX_PORT_ATTEMPTS = 10;
async function serveFrontendFile(filePath, res) {
  let actualPath;
  if (filePath === "/" || filePath === "/index.html") {
    actualPath = join2(__dirname, "frontend", "index.html");
  } else if (filePath.startsWith("/assets/")) {
    actualPath = join2(__dirname, "frontend", filePath.slice(1));
  } else {
    return false;
  }
  try {
    const content = await readFile3(actualPath);
    const ext = extname(actualPath);
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}
async function handleRequest(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method || "GET";
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const route = matchRoute(method, pathname);
  if (route) {
    await route.handler(req, res, route.params);
    return;
  }
  if (method === "GET") {
    const served = await serveFrontendFile(pathname, res);
    if (served) return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
}
function tryListen(port, attempt) {
  return new Promise((resolve2, reject) => {
    const server = createServer(async (req, res) => {
      try {
        await handleRequest(req, res);
      } catch (err) {
        console.error("Request error:", err);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      }
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE" && attempt < MAX_PORT_ATTEMPTS) {
        server.close();
        resolve2(tryListen(port + 1, attempt + 1));
      } else {
        reject(err);
      }
    });
    server.listen(port, "127.0.0.1", () => {
      resolve2(port);
    });
  });
}
async function main() {
  const envPort = process.env.MEMORY_EDITOR_PORT;
  const startPort = envPort ? parseInt(envPort, 10) : DEFAULT_PORT;
  try {
    const actualPort = await tryListen(startPort, 0);
    console.log(`Memory Editor running at http://127.0.0.1:${actualPort}`);
    console.log(JSON.stringify({ port: actualPort, url: `http://127.0.0.1:${actualPort}` }));
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}
main();
