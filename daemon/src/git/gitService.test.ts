import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitError, GitService, runGit, slugify } from './gitService.js';

let repo: string;
const svc = new GitService();

async function commit(cwd: string, message: string): Promise<void> {
  await runGit(cwd, ['-c', 'user.email=t@t', '-c', 'user.name=Test', 'commit', '-m', message]);
}

beforeAll(async () => {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'pc-git-')));
  repo = join(base, 'repo');
  mkdirSync(repo, { recursive: true });
  await runGit(repo, ['init', '-b', 'stag']);
  writeFileSync(join(repo, 'README.md'), '# base\n');
  await runGit(repo, ['add', 'README.md']);
  await commit(repo, 'init');
});

afterAll(() => {
  rmSync(join(repo, '..'), { recursive: true, force: true });
});

describe('slugify', () => {
  it('produces branch-safe slugs', () => {
    expect(slugify('Fix: Login!! ')).toBe('fix-login');
    expect(slugify('')).toBe('task');
  });
});

describe('GitService', () => {
  it('creates a worktree on claude/<slug> branched from base', async () => {
    const wt = await svc.createWorktree(repo, { taskId: 't1', name: 'Fix Login', baseRef: 'stag' });
    expect(wt.branch).toBe('claude/fix-login');
    expect(wt.baseRef).toBe('stag');
    expect(existsSync(wt.path)).toBe(true);
    expect(existsSync(join(wt.path, 'README.md'))).toBe(true); // base content present
    const list = await svc.listWorktrees(repo);
    expect(list.some((w) => w.branch === 'claude/fix-login')).toBe(true);
  });

  it('does not collide for parallel tasks with the same name', async () => {
    const [a, b] = await Promise.all([
      svc.createWorktree(repo, { taskId: 'p1', name: 'same', baseRef: 'stag' }),
      svc.createWorktree(repo, { taskId: 'p2', name: 'same', baseRef: 'stag' }),
    ]);
    expect(a.path).not.toBe(b.path);
    expect(a.branch).not.toBe(b.branch);
    expect(new Set([a.branch, b.branch]).size).toBe(2);
    expect([a.branch, b.branch].every((x) => x.startsWith('claude/same'))).toBe(true);
  });

  it('isolates commits to the task branch (base untouched)', async () => {
    const wt = await svc.createWorktree(repo, { taskId: 'iso', name: 'iso', baseRef: 'stag' });
    writeFileSync(join(wt.path, 'new.txt'), 'x\n');
    await runGit(wt.path, ['add', 'new.txt']);
    await commit(wt.path, 'add new');
    const baseFiles = await runGit(repo, ['ls-tree', '--name-only', 'stag']);
    expect(baseFiles).not.toContain('new.txt'); // base branch unaffected
    const branchFiles = await runGit(repo, ['ls-tree', '--name-only', wt.branch]);
    expect(branchFiles).toContain('new.txt');
  });

  it('removes a worktree and deletes its branch', async () => {
    const wt = await svc.createWorktree(repo, { taskId: 'rm', name: 'rm me', baseRef: 'stag' });
    await svc.removeWorktree(repo, 'rm');
    expect(existsSync(wt.path)).toBe(false);
    const list = await svc.listWorktrees(repo);
    expect(list.some((w) => w.branch === wt.branch)).toBe(false);
    await expect(
      runGit(repo, ['show-ref', '--verify', '--quiet', `refs/heads/${wt.branch}`]),
    ).rejects.toThrow();
  });

  it('rejects an unsafe task id', async () => {
    await expect(
      svc.createWorktree(repo, { taskId: '../evil', baseRef: 'stag' }),
    ).rejects.toThrow(/invalid task id/);
  });

  it('throws a clear error for a missing base ref', async () => {
    await expect(
      svc.createWorktree(repo, { taskId: 'nb', baseRef: 'does-not-exist' }),
    ).rejects.toThrow(GitError);
  });
});

describe('GitService diff (S2-05)', () => {
  let drepo: string;

  beforeAll(async () => {
    const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'pc-diff-')));
    drepo = join(base, 'repo');
    mkdirSync(drepo, { recursive: true });
    await runGit(drepo, ['init', '-b', 'stag']);
    writeFileSync(join(drepo, 'README.md'), 'line1\nline2\n');
    writeFileSync(join(drepo, 'foo.txt'), 'foo\n');
    await runGit(drepo, ['add', '.']);
    await commit(drepo, 'base');
  });

  afterAll(() => rmSync(join(drepo, '..'), { recursive: true, force: true }));

  it('summarizes tracked edits, untracked files, and a 3000-line file', async () => {
    writeFileSync(join(drepo, 'README.md'), 'line1\nCHANGED\nline2\n'); // modify tracked
    writeFileSync(join(drepo, 'small.txt'), 'hello\n'); // untracked
    writeFileSync(join(drepo, 'big.txt'), `${Array.from({ length: 3000 }, (_, i) => `line ${i}`).join('\n')}\n`);

    const files = await svc.diffSummary(drepo, 'stag');
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
    expect(byPath['README.md']?.status).toBe('modified');
    expect(byPath['small.txt']?.status).toBe('untracked');
    expect(byPath['big.txt']?.status).toBe('untracked');
    expect(byPath['big.txt']?.additions).toBe(3000);
  });

  it('returns a full per-file patch for a 3000-line file without crashing', async () => {
    const diff = await svc.diffFile(drepo, 'stag', 'big.txt');
    expect(diff.binary).toBe(false);
    expect(diff.truncated).toBe(false); // 3000 < 5000 line cap
    expect(diff.patch).toContain('+line 2999');
  });

  it('truncates when the patch exceeds the line cap', async () => {
    const diff = await svc.diffFile(drepo, 'stag', 'big.txt', { maxLines: 100 });
    expect(diff.truncated).toBe(true);
    expect(diff.patch!.split('\n').length).toBeLessThanOrEqual(100);
  });

  it('detects a binary file', async () => {
    writeFileSync(join(drepo, 'blob.bin'), Buffer.from([0, 1, 2, 0, 255, 0]));
    const files = await svc.diffSummary(drepo, 'stag');
    expect(files.find((f) => f.path === 'blob.bin')?.binary).toBe(true);
    const diff = await svc.diffFile(drepo, 'stag', 'blob.bin');
    expect(diff.binary).toBe(true);
    expect(diff.patch).toBeNull();
  });

  it('detects a rename', async () => {
    await runGit(drepo, ['mv', 'foo.txt', 'bar.txt']);
    const files = await svc.diffSummary(drepo, 'stag');
    const renamed = files.find((f) => f.path === 'bar.txt');
    expect(renamed?.status).toBe('renamed');
    expect(renamed?.oldPath).toBe('foo.txt');
  });

  it('rejects a path outside the worktree', async () => {
    await expect(svc.diffFile(drepo, 'stag', '../outside.txt')).rejects.toBeTruthy();
  });
});
