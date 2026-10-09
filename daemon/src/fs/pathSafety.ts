import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/**
 * Path safety (CLAUDE.md): every path from a client must resolve inside an allowlisted
 * root (a project or worktree). We block `..` traversal, symlink escapes, and absolute
 * paths outside the allowlist. This module is the single chokepoint for that check and
 * is reused by project registration (S1-03), the worktree service, and the file reader.
 */
export class PathNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathNotAllowedError';
  }
}

/** Resolve to an absolute path and follow symlinks when the path exists. */
function canonical(p: string): string {
  const abs = resolve(p);
  try {
    // native realpath collapses symlinks — this is what catches symlink escapes.
    return realpathSync.native(abs);
  } catch {
    // Path (or a parent) does not exist yet: fall back to the lexical absolute path.
    return abs;
  }
}

/** True if `target` is `root` itself or lives underneath it. Both should be canonical. */
export function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Canonicalize allowlist roots once (e.g. at startup). */
export function canonicalizeRoots(roots: string[]): string[] {
  return roots.map(canonical);
}

/**
 * Assert that an absolute candidate path resolves inside one of the allowlist roots.
 * Returns the canonical path on success; throws PathNotAllowedError otherwise.
 */
export function assertWithinAllowlist(candidate: string, roots: string[]): string {
  if (!isAbsolute(candidate)) {
    throw new PathNotAllowedError(`path must be absolute: "${candidate}"`);
  }
  if (roots.length === 0) {
    throw new PathNotAllowedError('no allowlisted roots are configured');
  }
  const target = canonical(candidate);
  for (const root of canonicalizeRoots(roots)) {
    if (isWithin(root, target)) return target;
  }
  throw new PathNotAllowedError(`path is outside the allowlist: "${candidate}"`);
}

/**
 * Safely resolve a (possibly relative) path underneath a known-safe root, blocking any
 * escape via `..` or symlinks. Use this for file access within a worktree.
 */
export function safeResolveWithin(root: string, relPath: string): string {
  const canonRoot = canonical(root);
  const lexical = resolve(canonRoot, relPath);
  if (!isWithin(canonRoot, lexical)) {
    throw new PathNotAllowedError(`path escapes its root: "${relPath}"`);
  }
  const canonTarget = canonical(lexical);
  if (!isWithin(canonRoot, canonTarget)) {
    throw new PathNotAllowedError(`path escapes its root via symlink: "${relPath}"`);
  }
  return canonTarget;
}
