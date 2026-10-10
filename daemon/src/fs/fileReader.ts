import { readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { safeResolveWithin } from './pathSafety.js';

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
