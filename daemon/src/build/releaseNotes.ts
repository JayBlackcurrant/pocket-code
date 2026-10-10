import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ProjectRegistry } from '../registry/projectRegistry.js';
import type { TaskStore } from '../db/taskStore.js';
import type { DiffFileSummary } from '../git/gitService.js';
import type { QueryFn, RunnerLogger } from '../agent/agentRunner.js';

const noopLogger: RunnerLogger = { info: () => {}, warn: () => {}, error: () => {} };

/** Tester-facing notes constraints (S3-03). */
export const MAX_BULLETS = 8;
const MAX_BULLET_LEN = 200;
/** Give up on the session and fall back to diff-derived notes after this long. */
const DEFAULT_TIMEOUT_MS = 60_000;

export class ReleaseNotesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseNotesError';
  }
}

export interface ReleaseNotesResult {
  notes: string[];
  /** 'session' = asked the task's Claude session; 'diff' = derived from changed files. */
  source: 'session' | 'diff';
}

/** The slice of GitService the notes service needs (narrowed so tests can stub it). */
export interface DiffProvider {
  diffSummary(repoPath: string, baseRef: string): Promise<DiffFileSummary[]>;
}

export interface ReleaseNotesDeps {
  tasks: TaskStore;
  git: DiffProvider;
  registry: ProjectRegistry;
  /** Defaults to the real SDK `query()`. Tests pass a fake; pass `null` to disable the
   *  session path entirely (always use the diff fallback). */
  query?: QueryFn | null;
  logger?: RunnerLogger;
  timeoutMs?: number;
}

const PROMPT = [
  'You just finished a coding task in this project.',
  'Write release notes for the testers who will install this build.',
  `Output at most ${MAX_BULLETS} short bullet points, one per line, each starting with "- ".`,
  'Describe the user-facing changes in plain language. No preamble, no headings, no code.',
].join(' ');

/** Pull up to MAX_BULLETS clean bullets out of free-form model text. Prefers lines that are
 *  explicit bullets; otherwise treats each non-empty line as one. */
export function parseBullets(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim());
  const bulletLike = lines.filter((l) => /^([-*•]|\d+[.)])\s+/.test(l));
  const chosen = bulletLike.length > 0 ? bulletLike : lines;
  return chosen
    .map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, '').trim())
    .filter((l) => l.length > 0)
    .map((l) => (l.length > MAX_BULLET_LEN ? l.slice(0, MAX_BULLET_LEN) : l))
    .slice(0, MAX_BULLETS);
}

/** Deterministic fallback: short bullets derived from the changed-files summary. */
export function bulletsFromDiff(files: DiffFileSummary[]): string[] {
  const meaningful = files.filter((f) => !isGenerated(f.path));
  const list = meaningful.length > 0 ? meaningful : files;
  if (list.length === 0) return ['No file changes detected.'];
  const verb: Record<DiffFileSummary['status'], string> = {
    added: 'Added',
    untracked: 'Added',
    modified: 'Updated',
    renamed: 'Renamed',
    copied: 'Added',
    deleted: 'Removed',
  };
  const bullets = list.slice(0, MAX_BULLETS - 1).map((f) => `${verb[f.status]} ${f.path}`);
  if (list.length > bullets.length) {
    bullets.push(`…and ${list.length - bullets.length} more file(s)`);
  }
  return bullets.slice(0, MAX_BULLETS);
}

function isGenerated(path: string): boolean {
  return (
    path.endsWith('.g.dart') ||
    path.endsWith('.gr.dart') ||
    path.endsWith('.freezed.dart') ||
    path.endsWith('pubspec.lock') ||
    path.includes('/gen/')
  );
}

/**
 * Release-notes generation (S3-03): asks the task's own Claude session (resumed by session
 * id) for up to 8 tester-facing bullets. If there is no session, or the session call fails
 * or times out, it falls back to notes derived from the git diff so the app always has
 * something to edit before upload.
 */
export class ReleaseNotesService {
  private readonly tasks: TaskStore;
  private readonly git: DiffProvider;
  private readonly registry: ProjectRegistry;
  private readonly query: QueryFn | undefined;
  private readonly timeoutMs: number;
  private log: RunnerLogger;

  constructor(deps: ReleaseNotesDeps) {
    this.tasks = deps.tasks;
    this.git = deps.git;
    this.registry = deps.registry;
    // undefined → real SDK; null → disabled (diff only); a fn → that fn.
    this.query = deps.query === null ? undefined : (deps.query ?? ((p) => sdkQuery(p)));
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.log = deps.logger ?? noopLogger;
  }

  setLogger(logger: RunnerLogger): void {
    this.log = logger;
  }

  async generate(taskId: string): Promise<ReleaseNotesResult> {
    const task = this.tasks.get(taskId);
    if (!task) throw new ReleaseNotesError(`unknown task: "${taskId}"`);
    if (!task.worktree) throw new ReleaseNotesError(`task "${taskId}" has no worktree yet`);
    const base = this.registry.get(task.projectId)?.manifest.git.base;

    // Preferred: ask the same session that did the work.
    if (task.sessionId && this.query) {
      try {
        const text = await this.askSession(task.sessionId, task.worktree);
        const notes = parseBullets(text);
        if (notes.length > 0) return { notes, source: 'session' };
        this.log.warn({ taskId }, 'release notes: session returned no usable bullets, using diff');
      } catch (err) {
        this.log.warn(
          { taskId, err: err instanceof Error ? err.message : String(err) },
          'release notes: session query failed, using diff',
        );
      }
    }

    // Fallback: derive from the diff.
    if (!base) return { notes: ['Build with recent changes.'], source: 'diff' };
    const files = await this.git.diffSummary(task.worktree, base);
    return { notes: bulletsFromDiff(files), source: 'diff' };
  }

  private async askSession(sessionId: string, cwd: string): Promise<string> {
    const query = this.query!;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.timeoutMs);
    try {
      const options: Options = {
        cwd,
        resume: sessionId,
        // Text-only: no tools, single turn — cheap and safe (never edits anything).
        allowedTools: [],
        maxTurns: 1,
        permissionMode: 'default',
        abortController: abort,
      };
      let text = '';
      for await (const msg of query({ prompt: PROMPT, options }) as AsyncIterable<SDKMessage>) {
        if (msg.type === 'result' && msg.subtype === 'success' && !msg.is_error) {
          text = msg.result ?? '';
        }
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
}
