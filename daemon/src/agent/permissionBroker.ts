import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { Db } from '../db/db.js';
import type { TaskStore } from '../db/taskStore.js';

export interface PendingPermission {
  id: string;
  taskId: string;
  toolName: string;
  input: Record<string, unknown>;
  createdAt: number;
}

export interface Decision {
  allow: boolean;
  /** For allow: optional edited tool input (defaults to the original). */
  input?: Record<string, unknown>;
  /** For deny: the reason/guidance sent back to the model. */
  reason?: string;
}

type PersistFn = (taskId: string, type: string, payload: unknown) => void;

/** Default: deny a parked tool call after 2 hours so runs never hang forever (S2-03). */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 2 * 60 * 60 * 1000;

const TIMEOUT_MESSAGE =
  'User unavailable: no approval within the time limit. Stop and summarize what you have done so far.';

interface Parked {
  taskId: string;
  toolName: string;
  input: Record<string, unknown>;
  resolve: (result: PermissionResult) => void;
  timer?: NodeJS.Timeout;
}

/**
 * The canUseTool bridge (S2-01). When the agent wants to use a tool that needs
 * permission, `request()` persists a pending approval, emits an event, and returns a
 * promise that stays unresolved until the phone calls `decide()` — so the agent waits
 * (even while the phone is offline) and resumes on the decision.
 */
export class PermissionBroker {
  private readonly parked = new Map<string, Parked>();

  constructor(
    private readonly db: Db,
    private readonly persist: PersistFn,
    private readonly tasks: TaskStore,
    /** Deny a parked request after this long (<=0 waits indefinitely). */
    private readonly timeoutMs: number = DEFAULT_APPROVAL_TIMEOUT_MS,
  ) {}

  /** Called from the agent's canUseTool callback. Resolves when the phone decides. */
  request(
    taskId: string,
    toolUseId: string,
    toolName: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<PermissionResult> {
    const createdAt = Date.now();
    this.db
      .prepare(
        'INSERT OR REPLACE INTO approvals (id, task_id, tool_name, input, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(toolUseId, taskId, toolName, JSON.stringify(input), 'pending', createdAt);

    this.tasks.setStatus(taskId, 'waiting');
    this.persist(taskId, 'agent.permission_request', { toolUseId, toolName, input });

    return new Promise<PermissionResult>((resolve) => {
      const parked: Parked = { taskId, toolName, input, resolve };
      this.parked.set(toolUseId, parked);

      // If the task is cancelled while waiting, stop waiting (deny + interrupt).
      if (signal.aborted) {
        this.settle(toolUseId, { behavior: 'deny', message: 'cancelled', interrupt: true });
        return;
      }
      signal.addEventListener(
        'abort',
        () => this.settle(toolUseId, { behavior: 'deny', message: 'cancelled', interrupt: true }),
        { once: true },
      );

      // Approval timeout (S2-03): deny with guidance to stop and summarize.
      if (this.timeoutMs > 0 && Number.isFinite(this.timeoutMs)) {
        parked.timer = setTimeout(() => this.onTimeout(toolUseId), this.timeoutMs);
      }
    });
  }

  private onTimeout(toolUseId: string): void {
    const parked = this.parked.get(toolUseId);
    if (!parked) return;
    this.db
      .prepare('UPDATE approvals SET status = ?, reason = ?, decided_at = ? WHERE id = ?')
      .run('timed_out', TIMEOUT_MESSAGE, Date.now(), toolUseId);
    this.persist(parked.taskId, 'agent.permission_timeout', {
      toolUseId,
      toolName: parked.toolName,
    });
    this.tasks.setStatus(parked.taskId, 'running');
    // interrupt:false → the model receives the guidance and summarizes rather than aborting.
    this.settle(toolUseId, { behavior: 'deny', message: TIMEOUT_MESSAGE, interrupt: false });
  }

  private settle(toolUseId: string, result: PermissionResult): void {
    const parked = this.parked.get(toolUseId);
    if (!parked) return;
    if (parked.timer) clearTimeout(parked.timer);
    this.parked.delete(toolUseId);
    parked.resolve(result);
  }

  /** Resolve a pending request from the phone. Returns false if nothing is pending. */
  decide(taskId: string, toolUseId: string, decision: Decision): boolean {
    const parked = this.parked.get(toolUseId);
    if (!parked || parked.taskId !== taskId) return false;

    const status = decision.allow ? 'allowed' : 'denied';
    this.db
      .prepare('UPDATE approvals SET status = ?, reason = ?, decided_at = ? WHERE id = ?')
      .run(status, decision.reason ?? null, Date.now(), toolUseId);

    this.persist(taskId, 'agent.permission_decision', {
      toolUseId,
      decision: status,
      reason: decision.reason ?? null,
    });
    // Resume running (the runner sets terminal status when the run actually ends).
    this.tasks.setStatus(taskId, 'running');

    const result: PermissionResult = decision.allow
      ? { behavior: 'allow', updatedInput: decision.input ?? parked.input }
      : { behavior: 'deny', message: decision.reason ?? 'Denied from phone' };
    this.settle(toolUseId, result);
    return true;
  }

  listPending(taskId: string): PendingPermission[] {
    const rows = this.db
      .prepare(
        "SELECT id, task_id, tool_name, input, created_at FROM approvals WHERE task_id = ? AND status = 'pending' ORDER BY created_at ASC",
      )
      .all(taskId) as Array<{
      id: string;
      task_id: string;
      tool_name: string;
      input: string;
      created_at: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      toolName: r.tool_name,
      input: JSON.parse(r.input) as Record<string, unknown>,
      createdAt: r.created_at,
    }));
  }

  /** Drop any still-parked promises for a finished task (resolve as deny to unblock). */
  clearTask(taskId: string): void {
    for (const [id, parked] of this.parked) {
      if (parked.taskId === taskId) {
        this.settle(id, { behavior: 'deny', message: 'task ended' });
      }
    }
  }
}
