/**
 * Coordinates the single project checkout shared by a Claude task and a live-run session (S5-04).
 *
 * Tasks run in place in the one project checkout (no worktrees), and a live run holds that same
 * checkout open for hot reload. So a task and a run may be active together ONLY when they are on
 * the **same branch** — Claude edits the branch and the run hot-reloads from disk. Any other
 * combination (a second task, a second run, or a task and a run on different branches) is refused.
 *
 * In-memory, like the per-service gates it replaces. A run/task cannot survive a daemon restart, so
 * crash recovery (AgentRunner/RunService.recoverInterrupted) reconciles the DB on boot while this
 * guard simply starts empty. See LIVE_RUN_PLAN.md §4.3.
 */
export type AcquireResult = { ok: true } | { ok: false; reason: string };

export class CheckoutGuard {
  /** Per project: the active task's branch (null while a fresh start is still creating it). */
  private readonly tasks = new Map<string, { branch: string | null }>();
  /** Per project: the active run session's branch. */
  private readonly runs = new Map<string, { branch: string }>();

  /**
   * Acquire the checkout for a task. `branch` is unknown at a fresh start (a new `claude/<slug>`
   * branch is created afterwards — call `setTaskBranch` once it exists); pass it for continue/resume
   * so a run already on that branch is allowed to coexist.
   */
  acquireTask(projectId: string, branch?: string): AcquireResult {
    if (this.tasks.has(projectId)) {
      return { ok: false, reason: `project "${projectId}" already has an active task; finish or discard it first` };
    }
    const run = this.runs.get(projectId);
    // A fresh start (branch undefined) always differs from any run branch, so it is refused while
    // a run is live; a continue on the run's branch is allowed.
    if (run && run.branch !== branch) {
      return {
        ok: false,
        reason: `a live run is active on branch "${run.branch}"; a task may only run on that same branch (stop the run first)`,
      };
    }
    this.tasks.set(projectId, { branch: branch ?? null });
    return { ok: true };
  }

  /** Record a task's branch once a fresh start has created it. No-op if no task is held. */
  setTaskBranch(projectId: string, branch: string): void {
    if (this.tasks.has(projectId)) this.tasks.set(projectId, { branch });
  }

  releaseTask(projectId: string): void {
    this.tasks.delete(projectId);
  }

  /** Acquire the checkout for a run session (its branch is always known up front). */
  acquireRun(projectId: string, branch: string): AcquireResult {
    if (this.runs.has(projectId)) {
      return { ok: false, reason: `project "${projectId}" already has an active run; stop it first` };
    }
    const task = this.tasks.get(projectId);
    if (task && task.branch !== branch) {
      const on = task.branch ?? 'another branch (starting)';
      return {
        ok: false,
        reason: `a task is active on "${on}"; a run may only target that same branch (finish the task first)`,
      };
    }
    this.runs.set(projectId, { branch });
    return { ok: true };
  }

  releaseRun(projectId: string): void {
    this.runs.delete(projectId);
  }

  hasTask(projectId: string): boolean {
    return this.tasks.has(projectId);
  }

  hasRun(projectId: string): boolean {
    return this.runs.has(projectId);
  }

  /** The active run's branch for a project, or null if no run is held. */
  runBranch(projectId: string): string | null {
    return this.runs.get(projectId)?.branch ?? null;
  }
}
