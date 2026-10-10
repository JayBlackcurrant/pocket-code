import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/db.js';
import { NotificationStore, type NotificationRow } from '../db/notificationStore.js';
import { buildEventToNotification, taskEventToNotification } from './notificationFeed.js';
import { NotificationService } from './notificationService.js';

class FakeSource<T> {
  private readonly listeners: Array<(e: T) => void> = [];
  onEvent(l: (e: T) => void): () => void {
    this.listeners.push(l);
    return () => {
      const i = this.listeners.indexOf(l);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }
  fire(e: T): void {
    for (const l of this.listeners) l(e);
  }
}

describe('notificationFeed', () => {
  it('maps notification-worthy task events and ignores the rest', () => {
    expect(taskEventToNotification('agent.permission_request', { toolName: 'Bash' })).toMatchObject({
      kind: 'approval',
      body: 'Bash needs your approval.',
    });
    expect(taskEventToNotification('task.completed', { status: 'done' })?.kind).toBe('taskDone');
    expect(taskEventToNotification('task.completed', { status: 'failed' })?.kind).toBe('taskFailed');
    expect(taskEventToNotification('task.error', {})?.kind).toBe('taskFailed');
    expect(taskEventToNotification('agent.assistant', {})).toBeNull();
  });

  it('maps build + upload events', () => {
    expect(buildEventToNotification('build.completed', {})?.kind).toBe('buildReady');
    expect(buildEventToNotification('build.error', { reason: 'step 2/3 failed' })).toMatchObject({
      kind: 'buildFailed',
      body: 'step 2/3 failed',
    });
    expect(buildEventToNotification('build.upload_completed', {})?.kind).toBe('shipped');
    expect(buildEventToNotification('build.upload_error', { reason: 'denied' })?.kind).toBe('uploadFailed');
    expect(buildEventToNotification('build.log', {})).toBeNull();
  });
});

describe('NotificationService', () => {
  let db: Db;
  let store: NotificationStore;
  let tasks: FakeSource<{ taskId: string; type: string; payload: unknown }>;
  let builds: FakeSource<{ buildId: string; type: string; payload: unknown }>;
  let svc: NotificationService;
  let emitted: NotificationRow[];

  beforeEach(() => {
    db = openDb(':memory:');
    store = new NotificationStore(db);
    tasks = new FakeSource();
    builds = new FakeSource();
    svc = new NotificationService({
      store,
      tasks,
      builds,
      buildLookup: { get: (id) => (id === 'b1' ? { taskId: 't-from-build' } : undefined) },
    });
    emitted = [];
    svc.onEvent((n) => emitted.push(n));
  });

  afterEach(() => {
    svc.dispose();
    db.close();
  });

  it('persists + emits a notification for an approval request, tagged with the task', () => {
    tasks.fire({ taskId: 't1', type: 'agent.permission_request', payload: { toolName: 'Bash' } });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ kind: 'approval', taskId: 't1' });
    expect(store.since(0)).toHaveLength(1);
  });

  it('ignores non-notification events', () => {
    tasks.fire({ taskId: 't1', type: 'agent.assistant', payload: {} });
    tasks.fire({ taskId: 't1', type: 'agent.stream_event', payload: {} });
    expect(emitted).toHaveLength(0);
  });

  it('resolves a build notification to its task via the lookup', () => {
    builds.fire({ buildId: 'b1', type: 'build.completed', payload: { artifact: '/x.apk' } });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ kind: 'buildReady', buildId: 'b1', taskId: 't-from-build' });
  });

  it('tracks unread count and marks read up to a seq', () => {
    tasks.fire({ taskId: 't1', type: 'task.completed', payload: { status: 'done' } });
    tasks.fire({ taskId: 't2', type: 'task.error', payload: {} });
    expect(svc.unreadCount()).toBe(2);
    const latest = emitted[emitted.length - 1]!.seq;
    svc.markReadUpTo(latest);
    expect(svc.unreadCount()).toBe(0);
  });

  it('replays missed notifications by seq', () => {
    tasks.fire({ taskId: 't1', type: 'task.completed', payload: { status: 'done' } });
    const first = emitted[0]!.seq;
    tasks.fire({ taskId: 't2', type: 'task.completed', payload: { status: 'done' } });
    // Only notifications after `first` come back on replay.
    const missed = svc.since(first);
    expect(missed).toHaveLength(1);
    expect(missed[0]!.taskId).toBe('t2');
  });

  it('stops emitting after dispose', () => {
    svc.dispose();
    tasks.fire({ taskId: 't1', type: 'task.completed', payload: { status: 'done' } });
    expect(emitted).toHaveLength(0);
  });
});
