import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';

export interface MemoryFile {
  path: string;
  projectName: string;
  projectPath: string;
  fileName: string;
  type: 'auto-memory' | 'project-root';
  lastModified: string;
  size: number;
}

export interface FileTree {
  files: MemoryFile[];
}

export interface SearchResult {
  file: MemoryFile;
  matches: SearchMatch[];
}

export interface SearchMatch {
  line: number;
  text: string;
  highlight: [number, number]; // start, end
}

/**
 * Encode a directory name the same way Claude Code does: replace every
 * `/`, `.`, `~`, `_`, `-`, and space with `-`. Non-ASCII chars (e.g. Korean,
 * CJK) are also replaced with `-`.
 */
function encodeName(name: string): string {
  return name.replace(/[\/\.~_\- ]|[^\x20-\x7E]/g, '-');
}

/**
 * Resolve an encoded project directory name back to a real filesystem path.
 *
 * Claude Code encodes paths lossily: every `/`, `.`, `~`, `_`, `-`, space,
 * and non-ASCII character maps to `-`. We cannot reverse this by string
 * manipulation alone. Instead, at each directory level we list real entries,
 * encode each one, and match against the remaining encoded string.
 */
async function resolveProjectPath(encoded: string): Promise<string | null> {
  // Strip leading dash (represents root /)
  const remaining = encoded.startsWith('-') ? encoded.slice(1) : encoded;
  return resolveStep('/', remaining);
}

async function resolveStep(current: string, remaining: string): Promise<string | null> {
  if (!remaining) return current;

  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return null;
  }

  // Build candidates: encode each dir entry and check if it matches
  // the start of `remaining`
  const candidates: { name: string; encodedLen: number }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const enc = encodeName(entry.name);
    if (remaining.startsWith(enc)) {
      candidates.push({ name: entry.name, encodedLen: enc.length });
    }
  }

  // Sort by longest match first (greedy — prefer deeper matches)
  candidates.sort((a, b) => b.encodedLen - a.encodedLen);

  for (const c of candidates) {
    const rest = remaining.slice(c.encodedLen);
    // After consuming this entry, remaining must be empty or start with `-` (path separator)
    if (rest === '') {
      return join(current, c.name);
    }
    if (rest.startsWith('-')) {
      const result = await resolveStep(join(current, c.name), rest.slice(1));
      if (result) return result;
    }
  }

  return null;
}

function extractProjectName(resolvedPath: string | null, encodedDir: string): string {
  if (resolvedPath) {
    // Use last 2 segments of the resolved real path
    const parts = resolvedPath.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return parts.slice(-2).join('/');
    }
    return parts[parts.length - 1] || encodedDir;
  }
  // Fallback: show encoded name as-is (better than wrong decoding)
  return encodedDir;
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function scanMemoryDir(memoryDir: string, projectEncoded: string): Promise<MemoryFile[]> {
  const files: MemoryFile[] = [];
  const resolvedPath = await resolveProjectPath(projectEncoded);
  const projectPath = resolvedPath || projectEncoded;
  const projectName = extractProjectName(resolvedPath, projectEncoded);

  async function walk(dir: string): Promise<void> {
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
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const s = await stat(fullPath);
          files.push({
            path: fullPath,
            projectName,
            projectPath,
            fileName: relative(memoryDir, fullPath),
            type: 'auto-memory',
            lastModified: s.mtime.toISOString(),
            size: s.size,
          });
        } catch {
          // skip inaccessible files
        }
      }
    }
  }

  await walk(memoryDir);
  return files;
}

export async function scanAllMemoryFiles(): Promise<FileTree> {
  const claudeDir = join(homedir(), '.claude', 'projects');
  const files: MemoryFile[] = [];

  if (!(await dirExists(claudeDir))) {
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

    const memoryDir = join(claudeDir, dir.name, 'memory');
    if (await dirExists(memoryDir)) {
      const memoryFiles = await scanMemoryDir(memoryDir, dir.name);
      files.push(...memoryFiles);
    }
  }

  // Sort by project name, then file name
  files.sort((a, b) => {
    const cmp = a.projectName.localeCompare(b.projectName);
    if (cmp !== 0) return cmp;
    return a.fileName.localeCompare(b.fileName);
  });

  return { files };
}

export async function searchFiles(query: string): Promise<SearchResult[]> {
  const { files } = await scanAllMemoryFiles();
  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  for (const file of files) {
    try {
      const content = await readFile(file.path, 'utf-8');
      const lines = content.split('\n');
      const matches: SearchMatch[] = [];

      for (let i = 0; i < lines.length; i++) {
        const lowerLine = lines[i].toLowerCase();
        const idx = lowerLine.indexOf(lowerQuery);
        if (idx !== -1) {
          matches.push({
            line: i + 1,
            text: lines[i],
            highlight: [idx, idx + query.length],
          });
        }
      }

      if (matches.length > 0) {
        results.push({ file, matches });
      }
    } catch {
      // skip unreadable files
    }
  }

  return results;
}
