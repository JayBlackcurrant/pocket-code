import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileSafe, FileTooLargeError, NotAFileError } from './fileReader.js';
import { PathNotAllowedError } from './pathSafety.js';

let root: string;

beforeEach(() => {
  // Canonicalize (macOS /var -> /private/var) so relative paths match, like the registry's resolvedPath.
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'pc-write-')));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('writeFileSafe', () => {
  it('creates a new file (and missing parent dirs) within the root', () => {
    const res = writeFileSafe(root, 'lib/src/foo.dart', 'void main() {}\n');
    expect(res.path).toBe('lib/src/foo.dart');
    expect(res.bytes).toBe('void main() {}\n'.length);
    expect(readFileSync(join(root, 'lib/src/foo.dart'), 'utf8')).toBe('void main() {}\n');
  });

  it('overwrites an existing file', () => {
    writeFileSync(join(root, 'a.txt'), 'old');
    writeFileSafe(root, 'a.txt', 'new content');
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('new content');
  });

  it('rejects a path escaping the root', () => {
    expect(() => writeFileSafe(root, '../escape.txt', 'x')).toThrow(PathNotAllowedError);
    expect(() => writeFileSafe(root, '/etc/passwd', 'x')).toThrow(PathNotAllowedError);
  });

  it('refuses to overwrite a directory', () => {
    mkdirSync(join(root, 'adir'));
    expect(() => writeFileSafe(root, 'adir', 'x')).toThrow(NotAFileError);
  });

  it('rejects content over the byte cap', () => {
    expect(() => writeFileSafe(root, 'big.txt', 'xxxxx', 4)).toThrow(FileTooLargeError);
  });
});
