import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { safeResolveWithin } from './pathSafety.js';

/** Directories/files never shown in the project browser (heavy or noise). */
const IGNORED_NAMES = new Set([
  '.git',
  '.worktrees',
  'node_modules',
  'build',
  'dist',
  '.dart_tool',
  '.fvm',
  '.idea',
  '.vscode',
  '.DS_Store',
]);

export interface TreeEntry {
  name: string;
  path: string; // relative to the root
  type: 'dir' | 'file';
}

/**
 * Recursively find files under `root` whose relative path matches `query`
 * (case-insensitive substring) for @-mention autocomplete. Bounded: scans at most
 * `maxScan` files and returns at most `limit`, so a huge repo can't stall the daemon.
 * Basename matches and shorter paths rank first.
 */
export function searchFiles(
  root: string,
  query: string,
  { limit = 50, maxScan = 20000 }: { limit?: number; maxScan?: number } = {},
): string[] {
  const q = query.toLowerCase();
  const matches: string[] = [];
  let scanned = 0;

  const walk = (dir: string): void => {
    if (matches.length >= limit || scanned >= maxScan) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (matches.length >= limit || scanned >= maxScan) return;
      if (IGNORED_NAMES.has(e.name)) continue;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        walk(abs);
      } else {
        scanned++;
        const rel = relative(root, abs);
        if (q === '' || rel.toLowerCase().includes(q)) matches.push(rel);
      }
    }
  };
  walk(root);

  matches.sort((a, b) => {
    const an = a.slice(a.lastIndexOf('/') + 1).toLowerCase();
    const bn = b.slice(b.lastIndexOf('/') + 1).toLowerCase();
    const aHit = q !== '' && an.includes(q) ? 0 : 1;
    const bHit = q !== '' && bn.includes(q) ? 0 : 1;
    if (aHit !== bHit) return aHit - bHit;
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  });
  return matches.slice(0, limit);
}

/**
 * List one directory inside `root` (S: project browser), path-safe. Directories first,
 * then files, both alphabetical. Heavy/noise entries are hidden. Non-recursive — the
 * client expands folders on demand.
 */
export function listDir(root: string, relPath: string): TreeEntry[] {
  const abs = safeResolveWithin(root, relPath === '' ? '.' : relPath);
  let stat;
  try {
    stat = statSync(abs);
  } catch {
    throw new FileNotFoundError(relPath);
  }
  if (!stat.isDirectory()) throw new NotADirectoryError(relPath);

  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => !IGNORED_NAMES.has(e.name))
    .map((e) => ({
      name: e.name,
      path: relative(root, join(abs, e.name)),
      type: (e.isDirectory() ? 'dir' : 'file') as 'dir' | 'file',
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** Cap returned file content so a huge file can't blow up the daemon/phone. */
export const FILE_MAX_BYTES = 512 * 1024;

export class FileNotFoundError extends Error {
  constructor(path: string) {
    super(`file not found: "${path}"`);
    this.name = 'FileNotFoundError';
  }
}

export class NotAFileError extends Error {
  constructor(path: string) {
    super(`not a file: "${path}"`);
    this.name = 'NotAFileError';
  }
}

export class NotADirectoryError extends Error {
  constructor(path: string) {
    super(`not a directory: "${path}"`);
    this.name = 'NotADirectoryError';
  }
}

export interface FileContent {
  path: string;
  size: number;
  binary: boolean;
  truncated: boolean;
  content: string | null; // null when binary
}

/** Null byte in the first chunk ⇒ treat as binary (don't return as text). */
function isBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/**
 * Read a file inside `root` (S2-06), read-only and path-safe: the path must resolve
 * within the worktree — `..` traversal and symlink escapes are rejected
 * (PathNotAllowedError) before any read.
 */
export function readFileSafe(root: string, relPath: string, maxBytes = FILE_MAX_BYTES): FileContent {
  const abs = safeResolveWithin(root, relPath); // throws PathNotAllowedError on escape
  const rel = relative(root, abs);

  let stat;
  try {
    stat = statSync(abs);
  } catch {
    throw new FileNotFoundError(rel);
  }
  if (!stat.isFile()) throw new NotAFileError(rel);

  const buf = readFileSync(abs);
  if (isBinary(buf)) {
    return { path: rel, size: stat.size, binary: true, truncated: false, content: null };
  }
  const truncated = buf.length > maxBytes;
  const slice = truncated ? buf.subarray(0, maxBytes) : buf;
  return { path: rel, size: stat.size, binary: false, truncated, content: slice.toString('utf8') };
}
