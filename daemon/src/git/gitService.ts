import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { safeResolveWithin } from '../fs/pathSafety.js';

const execFileAsync = promisify(execFile);

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
  path: string; // absolute, canonical worktree path
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

interface ParsedWorktree {
  path: string;
  branch?: string;
  head?: string;
}

function isBranchExistsError(err: unknown): boolean {
  return err instanceof GitError && /already (exists|used)/i.test(err.message);
}

/**
 * Manages one git worktree + branch per task (CLAUDE.md). Worktrees live under
 * `<repo>/.worktrees/<taskId>` on branch `claude/<slug>`. Branch creation is
 * race-safe: `git worktree add -b` fails atomically if the branch exists, so
 * concurrent tasks with the same slug fall back to `claude/<slug>-2`, `-3`, ….
 */
export class GitService {
  constructor(private readonly git: GitRunner = runGit) {}

  private worktreePath(repoPath: string, taskId: string): string {
    assertTaskId(taskId);
    return safeResolveWithin(repoPath, join('.worktrees', taskId));
  }

  /** Keep `.worktrees/` out of the main working tree's status without editing the
   *  committed .gitignore — add it to the repo's local info/exclude. */
  private async ensureExcluded(repoPath: string): Promise<void> {
    const gitCommonDir = (await this.git(repoPath, ['rev-parse', '--git-common-dir'])).trim();
    const base = isAbsolute(gitCommonDir) ? gitCommonDir : join(repoPath, gitCommonDir);
    const excludePath = join(base, 'info', 'exclude');
    try {
      const current = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
      if (current.split(/\r?\n/).some((l) => l.trim() === '.worktrees/')) return;
      mkdirSync(dirname(excludePath), { recursive: true });
      const prefix = current === '' || current.endsWith('\n') ? '' : '\n';
      appendFileSync(excludePath, `${prefix}.worktrees/\n`);
    } catch {
      // Non-fatal: exclusion is a convenience, not a correctness requirement.
    }
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

  async listWorktrees(repoPath: string): Promise<ParsedWorktree[]> {
    const out = await this.git(repoPath, ['worktree', 'list', '--porcelain']);
    const entries: ParsedWorktree[] = [];
    let cur: Partial<ParsedWorktree> = {};
    for (const line of out.split('\n')) {
      if (line === '') {
        if (cur.path) entries.push(cur as ParsedWorktree);
        cur = {};
        continue;
      }
      const sp = line.indexOf(' ');
      const key = sp === -1 ? line : line.slice(0, sp);
      const val = sp === -1 ? '' : line.slice(sp + 1);
      if (key === 'worktree') cur.path = val;
      else if (key === 'branch') cur.branch = val.replace(/^refs\/heads\//, '');
      else if (key === 'HEAD') cur.head = val;
    }
    if (cur.path) entries.push(cur as ParsedWorktree);
    return entries;
  }

  async createWorktree(repoPath: string, opts: CreateWorktreeOpts): Promise<WorktreeInfo> {
    const path = this.worktreePath(repoPath, opts.taskId);
    if (existsSync(path)) {
      throw new GitError(`worktree path already exists: ${path}`);
    }
    await this.ensureExcluded(repoPath);
    const baseRef = await this.resolveBaseRef(repoPath, opts.baseRef);
    const slug = opts.slug ?? slugify(opts.name ?? opts.taskId);

    for (let n = 1; n <= 50; n++) {
      const branch = n === 1 ? `claude/${slug}` : `claude/${slug}-${n}`;
      try {
        await this.git(repoPath, ['worktree', 'add', '-b', branch, path, baseRef]);
        return { taskId: opts.taskId, slug, branch, path, baseRef };
      } catch (err) {
        if (isBranchExistsError(err)) continue; // race/collision: try next suffix
        throw err;
      }
    }
    throw new GitError(`could not find a free branch name for slug "${slug}"`);
  }

  /** Remove a task's worktree and (by default) delete its claude/* branch. */
  async removeWorktree(
    repoPath: string,
    taskId: string,
    opts: { deleteBranch?: boolean; force?: boolean } = {},
  ): Promise<void> {
    const { deleteBranch = true, force = true } = opts;
    const path = this.worktreePath(repoPath, taskId);
    const entry = (await this.listWorktrees(repoPath)).find((w) => w.path === path);

    await this.git(repoPath, ['worktree', 'remove', ...(force ? ['--force'] : []), path]);

    if (deleteBranch && entry?.branch && entry.branch.startsWith('claude/')) {
      try {
        await this.git(repoPath, ['branch', '-D', entry.branch]);
      } catch {
        // Branch may already be gone; discard is best-effort.
      }
    }
  }
}
