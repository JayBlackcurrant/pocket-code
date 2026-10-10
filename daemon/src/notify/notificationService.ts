import { EventEmitter } from 'node:events';
import type { NotificationStore, NotificationRow } from '../db/notificationStore.js';
import { buildEventToNotification, taskEventToNotification } from './notificationFeed.js';

/** The minimal slices the service subscribes to (narrowed for testability). */
export interface TaskEventSource {
  onEvent(listener: (e: { taskId: string; type: string; payload: unknown }) => void): () => void;
}
export interface BuildEventSource {
  onEvent(listener: (e: { buildId: string; type: string; payload: unknown }) => void): () => void;
}
export interface BuildTaskLookup {
  get(buildId: string): { taskId: string | null } | undefined;
}

export interface NotificationServiceDeps {
  store: NotificationStore;
  tasks: TaskEventSource;
  builds: BuildEventSource;
  /** Resolve a build's task id so a build notification can deep-link to the task. */
  buildLookup: BuildTaskLookup;
}

/**
 * Self-contained notification service (S3-05): subscribes to the existing task + build event
 * streams, translates the notification-worthy ones into stored notifications (event-log-first,
 * with a monotonic seq), and emits them live for the notifications WebSocket. No external
 * push service — the phone reads these over the tailnet and replays missed ones by seq.
 */
export class NotificationService {
  private readonly store: NotificationStore;
  private readonly buildLookup: BuildTaskLookup;
  private readonly emitter = new EventEmitter();
  private readonly unsubs: Array<() => void> = [];

  constructor(deps: NotificationServiceDeps) {
    this.store = deps.store;
    this.buildLookup = deps.buildLookup;
    this.emitter.setMaxListeners(0);
    this.unsubs.push(deps.tasks.onEvent((e) => this.onTaskEvent(e)));
    this.unsubs.push(deps.builds.onEvent((e) => this.onBuildEvent(e)));
  }

  /** Subscribe to notifications as they are created (used by the notifications WebSocket). */
  onEvent(listener: (n: NotificationRow) => void): () => void {
    this.emitter.on('notification', listener);
    return () => this.emitter.off('notification', listener);
  }

  since(sinceSeq: number): NotificationRow[] {
    return this.store.since(sinceSeq);
  }

  recent(limit?: number): NotificationRow[] {
    return this.store.recent(limit);
  }

  unreadCount(): number {
    return this.store.unreadCount();
  }

  markReadUpTo(seq: number): void {
    this.store.markReadUpTo(seq);
  }

  /** Stop listening (for shutdown/tests). */
  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
  }

  private onTaskEvent(e: { taskId: string; type: string; payload: unknown }): void {
    const draft = taskEventToNotification(e.type, e.payload);
    if (!draft) return;
    const n = this.store.append({ ...draft, taskId: e.taskId });
    this.emitter.emit('notification', n);
  }

  private onBuildEvent(e: { buildId: string; type: string; payload: unknown }): void {
    const draft = buildEventToNotification(e.type, e.payload);
    if (!draft) return;
    const taskId = this.buildLookup.get(e.buildId)?.taskId ?? null;
    const n = this.store.append({ ...draft, taskId, buildId: e.buildId });
    this.emitter.emit('notification', n);
  }
}
