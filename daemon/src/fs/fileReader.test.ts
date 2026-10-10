import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PathNotAllowedError } from './pathSafety.js';
import {
  FileNotFoundError,
  NotAFileError,
  NotADirectoryError,
  listDir,
  readFileSafe,
} from './fileReader.js';

let root: string;
let outside: string;

beforeAll(() => {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'pc-filereader-')));
  root = join(base, 'worktree');
  outside = join(base, 'outside');
  mkdirSync(join(root, 'lib'), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(root, 'lib', 'main.dart'), 'void main() {}\n');
  writeFileSync(join(root, 'blob.bin'), Buffer.from([0, 1, 2, 0, 255]));
  writeFileSync(join(outside, 'secret.txt'), 'top secret');
  symlinkSync(outside, join(root, 'escape'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('readFileSafe', () => {
  it('reads a text file', () => {
    const f = readFileSafe(root, 'lib/main.dart');
    expect(f.binary).toBe(false);
    expect(f.content).toContain('void main');
    expect(f.path).toBe('lib/main.dart');
  });

  it('flags a binary file and returns no content', () => {
    const f = readFileSafe(root, 'blob.bin');
    expect(f.binary).toBe(true);
    expect(f.content).toBeNull();
  });

  it('truncates past the byte cap', () => {
    const f = readFileSafe(root, 'lib/main.dart', 5);
    expect(f.truncated).toBe(true);
    expect(f.content!.length).toBe(5);
  });

  it('rejects `..` traversal outside the worktree', () => {
    expect(() => readFileSafe(root, '../outside/secret.txt')).toThrow(PathNotAllowedError);
  });

  it('rejects a symlink escape', () => {
    expect(() => readFileSafe(root, 'escape/secret.txt')).toThrow(PathNotAllowedError);
  });

  it('throws FileNotFoundError for a missing file', () => {
    expect(() => readFileSafe(root, 'nope.txt')).toThrow(FileNotFoundError);
  });

  it('throws NotAFileError for a directory', () => {
    expect(() => readFileSafe(root, 'lib')).toThrow(NotAFileError);
  });
});

describe('listDir', () => {
  it('lists directory contents with directories first', () => {
    const entries = listDir(root, '');
    expect(entries.map((e) => e.name)).toContain('lib');
    expect(entries.map((e) => e.name)).toContain('blob.bin');
    expect(entries[0]!.type).toBe('dir');
  });

  it('rejects a non-directory', () => {
    expect(() => listDir(root, 'blob.bin')).toThrow(NotADirectoryError);
  });
});
