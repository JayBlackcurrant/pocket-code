import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import { relative } from 'node:path';
import { promisify } from 'node:util';
import { safeResolveWithin } from '../fs/pathSafety.js';

const execFileAsync = promisify(execFile);

/** Caps so a huge diff can't blow up the daemon or the phone (S2-05). */
export const DIFF_MAX_BYTES = 512 * 1024;
export const DIFF_MAX_LINES = 5000;

export interface DiffFileSummary {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked';
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface FileDiff {
  path: string;
  binary: boolean;
  truncated: boolean;
  patch: string | null; // null when binary
}

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}

/** Run a git command in a repo. Uses execFile (no shell) so paths/args are never
 *  interpreted by a shell. Returns stdout. */
export async function runGit(repoPath: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new GitError(`git ${args.join(' ')} failed: ${(err.stderr || err.message).trim()}`);
  }
}

export type GitRunner = (repoPath: string, args: string[]) => Promise<string>;

/** Task ids become directory names, so keep them to a safe, non-traversing charset. */
const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function assertTaskId(taskId: string): void {
  if (!TASK_ID_RE.test(taskId) || taskId.includes('..')) {
    throw new GitError(`invalid task id: "${taskId}"`);
  }
}

/** Turn an arbitrary task name into a branch-safe slug. */
export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return s.length > 0 ? s : 'task';
}

export interface WorktreeInfo {
  taskId: string;
  slug: string;
  branch: string; // claude/<slug>[-n]
  path: string; // the project checkout dir (tasks run in place, not in a worktree)
  baseRef: string; // the ref actually branched from
}

export interface CreateWorktreeOpts {
  taskId: string;
  /** Base branch to fork from (e.g. the manifest's git.base, like `stag`). */
  baseRef: string;
  /** Human task name used to derive the slug; or pass `slug` directly. */
  name?: string;
  slug?: string;
}

function isBranchExistsError(err: unknown): boolean {
  return err instanceof GitError && /already (exists|used)/i.test(err.message);
}

/**
 * Manages one task branch per project (CLAUDE.md). Tasks run **in place** in the project
 * checkout on branch `claude/<slug>` — not in a separate worktree — so gitignored local
 * files (signing keys, local.properties) are present for builds. Only one task may own a
 * project's checkout at a time (serialized by the caller). Branch-name collisions fall back
 * to `claude/<slug>-2`, `-3`, ….
 */
export class GitService {
  constructor(private readonly git: GitRunner = runGit) {}

  /** True when the working tree has no staged, unstaged, or untracked changes. */
  async isClean(repoPath: string): Promise<boolean> {
    return (await this.git(repoPath, ['status', '--porcelain'])).trim() === '';
  }

  /** Check out an existing branch. Fails (GitError) if switching away from a dirty tree —
   *  a no-op when already on `branch`. Used before a build to target the task's branch. */
  async checkoutBranch(repoPath: string, branch: string): Promise<void> {
    await this.git(repoPath, ['checkout', branch]);
  }

  private async resolveBaseRef(repoPath: string, baseRef: string): Promise<string> {
    for (const ref of [baseRef, `origin/${baseRef}`]) {
      try {
        await this.git(repoPath, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
        return ref;
      } catch {
        // try next candidate
      }
    }
    throw new GitError(`base ref not found: "${baseRef}" (nor "origin/${baseRef}")`);
  }

  /**
   * Start a task **in place**: create branch `claude/<slug>` in the project checkout, branched
   * from the resolved base, and leave the checkout on it. Requires a clean working tree so no
   * uncommitted work is lost or mixed between tasks (the caller serializes to one task at a time).
   * Returns `path` = the project dir (we no longer use a separate worktree).
   */
  async createTaskBranch(repoPath: string, opts: CreateWorktreeOpts): Promise<WorktreeInfo> {
    assertTaskId(opts.taskId);
    if (!(await this.isClean(repoPath))) {
      throw new GitError(
        'working tree is not clean; commit or discard the active task before starting a new one',
      );
    }
    const baseRef = await this.resolveBaseRef(repoPath, opts.baseRef);
    const slug = opts.slug ?? slugify(opts.name ?? opts.taskId);

    for (let n = 1; n <= 50; n++) {
      const branch = n === 1 ? `claude/${slug}` : `claude/${slug}-${n}`;
      try {
        await this.git(repoPath, ['checkout', '-b', branch, baseRef]);
        return { taskId: opts.taskId, slug, branch, path: repoPath, baseRef };
      } catch (err) {
        if (isBranchExistsError(err)) continue; // name taken: try the next suffix
        throw err;
      }
    }
    throw new GitError(`could not find a free branch name for slug "${slug}"`);
  }

  /**
   * Discard a task: drop its uncommitted work, return the checkout to the base branch, and
   * delete its `claude/*` branch. Destructive to the shared checkout by design — the caller
   * must only call this for the task that currently owns the project.
   */
  async discardTaskBranch(repoPath: string, branch: string, baseRef: string): Promise<void> {
    const base = await this.resolveBaseRef(repoPath, baseRef);
    await this.git(repoPath, ['reset', '--hard']);
    await this.git(repoPath, ['clean', '-fd']); // drop untracked files (gitignored ones kept)
    await this.git(repoPath, ['checkout', base]);
    if (branch && branch.startsWith('claude/')) {
      try {
        await this.git(repoPath, ['branch', '-D', branch]);
      } catch {
        // Branch may not exist yet / already gone; discard is best-effort.
      }
    }
  }

  /** Run a git diff command, tolerating exit code 1 (= differences found). */
  private async gitDiff(repoPath: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], {
        maxBuffer: 32 * 1024 * 1024,
      });
      return stdout;
    } catch (e) {
      const err = e as { code?: number; stdout?: string; stderr?: string; message: string };
      if (err.code === 1 && typeof err.stdout === 'string') return err.stdout;
      throw new GitError(`git ${args.join(' ')} failed: ${(err.stderr || err.message).trim()}`);
    }
  }

  /**
   * Changed files vs the base ref (S2-05): tracked changes from `git diff` plus untracked
   * files, with rename detection, +/- counts, and binary flags.
   */
  async diffSummary(repoPath: string, baseRef: string): Promise<DiffFileSummary[]> {
    const base = await this.resolveBaseRef(repoPath, baseRef);
    const files = new Map<string, DiffFileSummary>();

    // Status + paths (authoritative; carries rename old/new).
    const nameStatus = await this.gitDiff(repoPath, ['diff', '--name-status', '-M', base]);
    for (const line of nameStatus.split('\n')) {
      if (line.trim() === '') continue;
      const parts = line.split('\t');
      const code = parts[0] ?? '';
      if (code.startsWith('R') || code.startsWith('C')) {
        const oldPath = parts[1] ?? '';
        const path = parts[2] ?? '';
        files.set(path, {
          path,
          oldPath,
          status: code.startsWith('R') ? 'renamed' : 'copied',
          additions: 0,
          deletions: 0,
          binary: false,
        });
      } else {
        const path = parts[1] ?? '';
        files.set(path, { path, status: statusFromCode(code), additions: 0, deletions: 0, binary: false });
      }
    }

    // Line counts (keyed by the new path).
    const numstat = await this.gitDiff(repoPath, ['diff', '--numstat', '-M', base]);
    for (const line of numstat.split('\n')) {
      if (line.trim() === '') continue;
      const [addRaw, delRaw, ...rest] = line.split('\t');
      const path = numstatNewPath(rest.join('\t'));
      const entry = files.get(path);
      if (!entry) continue;
      if (addRaw === '-' || delRaw === '-') {
        entry.binary = true;
      } else {
        entry.additions = Number(addRaw) || 0;
        entry.deletions = Number(delRaw) || 0;
      }
    }

    // Untracked files (not shown by `git diff`).
    const untracked = await this.git(repoPath, ['ls-files', '--others', '--exclude-standard']);
    for (const path of untracked.split('\n')) {
      if (path.trim() === '' || files.has(path)) continue;
      const stat = await this.gitDiff(repoPath, ['diff', '--numstat', '--no-index', '--', '/dev/null', path]);
      const cols = stat.split('\n')[0]?.split('\t') ?? [];
      const binary = cols[0] === '-' || cols[1] === '-';
      files.set(path, {
        path,
        status: 'untracked',
        additions: binary ? 0 : Number(cols[0]) || 0,
        deletions: 0,
        binary,
      });
    }

    return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Unified patch for one changed file vs base (S2-05), size-capped. */
  async diffFile(
    repoPath: string,
    baseRef: string,
    relPath: string,
    opts: { maxBytes?: number; maxLines?: number } = {},
  ): Promise<FileDiff> {
    const { maxBytes = DIFF_MAX_BYTES, maxLines = DIFF_MAX_LINES } = opts;
    const abs = safeResolveWithin(repoPath, relPath); // blocks traversal/symlink escape
    const rel = relative(repoPath, abs);
    const base = await this.resolveBaseRef(repoPath, baseRef);

    const isUntracked =
      (await this.git(repoPath, ['ls-files', '--others', '--exclude-standard', '--', rel])).trim() !== '';
    const patch = isUntracked
      ? await this.gitDiff(repoPath, ['diff', '-U3', '--no-index', '--', '/dev/null', rel])
      : await this.gitDiff(repoPath, ['diff', '-U3', '-M', base, '--', rel]);

    if (/^Binary files /m.test(patch)) {
      return { path: rel, binary: true, truncated: false, patch: null };
    }

    let out = patch;
    let truncated = false;
    const lines = out.split('\n');
    if (lines.length > maxLines) {
      out = lines.slice(0, maxLines).join('\n');
      truncated = true;
    }
    if (out.length > maxBytes) {
      out = out.slice(0, maxBytes);
      truncated = true;
    }
    return { path: rel, binary: false, truncated, patch: out };
  }

  /** Suggest a commit message from the changed-files summary (editable in the app). */
  async suggestCommitMessage(repoPath: string, baseRef: string): Promise<string> {
    const files = await this.diffSummary(repoPath, baseRef);
    if (files.length === 0) return 'chore: no changes';
    if (files.length === 1) return `chore: update ${files[0]!.path}`;
    return `chore: update ${files.length} files`;
  }

  /** Stage everything and commit (S2-09). Throws GitError('nothing to commit') when clean. */
  async commitAll(repoPath: string, message: string): Promise<{ sha: string; message: string }> {
    await this.git(repoPath, ['add', '-A']);
    // git prints "nothing to commit" to stdout (not stderr), so check status instead.
    const status = (await this.git(repoPath, ['status', '--porcelain'])).trim();
    if (status === '') throw new GitError('nothing to commit');
    await this.git(repoPath, [
      '-c',
      'user.name=PocketCode',
      '-c',
      'user.email=agent@pocketcode.local',
      'commit',
      '-m',
      message,
    ]);
    const sha = (await this.git(repoPath, ['rev-parse', 'HEAD'])).trim();
    return { sha, message };
  }

  /** Discard a single file's changes vs the index/HEAD (untracked ⇒ delete). Path-safe. */
  async revertFile(repoPath: string, relPath: string): Promise<void> {
    const abs = safeResolveWithin(repoPath, relPath);
    const rel = relative(repoPath, abs);
    const untracked =
      (await this.git(repoPath, ['ls-files', '--others', '--exclude-standard', '--', rel])).trim() !== '';
    if (untracked) {
      rmSync(abs, { force: true });
    } else {
      await this.git(repoPath, ['restore', '--staged', '--worktree', '--', rel]);
    }
  }

  /** Push the task branch to its remote (S2-09). Refuses anything but a claude/* branch. */
  async pushBranch(repoPath: string, remote: string, branch: string): Promise<void> {
    if (!branch.startsWith('claude/')) {
      throw new GitError(`refusing to push non-claude branch: "${branch}"`);
    }
    await this.git(repoPath, ['push', '-u', remote, branch]);
  }
}

function statusFromCode(code: string): DiffFileSummary['status'] {
  switch (code[0]) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'M':
    default:
      return 'modified';
  }
}

/** Extract the new path from a numstat path field, handling rename forms. */
function numstatNewPath(field: string): string {
  if (!field.includes('=>')) return field;
  const collapsed = field.replace(/\{[^}]*=> ([^}]*)\}/g, '$1');
  if (collapsed.includes('=>')) {
    const parts = collapsed.split('=>');
    return (parts[parts.length - 1] ?? '').trim();
  }
  return collapsed.trim();
}
