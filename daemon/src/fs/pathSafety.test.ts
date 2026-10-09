import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertWithinAllowlist,
  PathNotAllowedError,
  safeResolveWithin,
} from './pathSafety.js';

let root: string; // an allowlisted root
let outside: string; // a sibling dir NOT on the allowlist

beforeAll(() => {
  // Canonicalize the temp base so expectations match realpath output (macOS maps
  // /var -> /private/var, which the safety code resolves via realpath).
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'pc-pathsafe-')));
  root = join(base, 'allowed');
  outside = join(base, 'outside');
  mkdirSync(join(root, 'repo'), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(root, 'repo', 'file.txt'), 'hi');
  writeFileSync(join(outside, 'secret.txt'), 'nope');
  // Symlink inside the root that points outside it — must be caught.
  symlinkSync(outside, join(root, 'escape'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('assertWithinAllowlist', () => {
  it('accepts a path inside an allowlisted root', () => {
    expect(assertWithinAllowlist(join(root, 'repo'), [root])).toBe(join(root, 'repo'));
  });

  it('rejects a path outside the allowlist', () => {
    expect(() => assertWithinAllowlist(outside, [root])).toThrow(PathNotAllowedError);
  });

  it('rejects a relative path', () => {
    expect(() => assertWithinAllowlist('repo/file.txt', [root])).toThrow(/absolute/);
  });

  it('rejects when no roots are configured', () => {
    expect(() => assertWithinAllowlist(join(root, 'repo'), [])).toThrow(/no allowlisted roots/);
  });

  it('rejects a `..` traversal that escapes the root', () => {
    expect(() => assertWithinAllowlist(join(root, 'repo', '..', '..', 'outside'), [root])).toThrow(
      PathNotAllowedError,
    );
  });

  it('rejects a symlink that escapes the root', () => {
    // root/escape -> outside ; following it must be blocked.
    expect(() => assertWithinAllowlist(join(root, 'escape'), [root])).toThrow(PathNotAllowedError);
  });
});

describe('safeResolveWithin', () => {
  it('resolves a child path', () => {
    expect(safeResolveWithin(root, 'repo/file.txt')).toBe(join(root, 'repo', 'file.txt'));
  });

  it('blocks `..` escape', () => {
    expect(() => safeResolveWithin(root, '../outside/secret.txt')).toThrow(PathNotAllowedError);
  });

  it('blocks symlink escape', () => {
    expect(() => safeResolveWithin(root, 'escape/secret.txt')).toThrow(PathNotAllowedError);
  });
});
