import type { NotificationKind } from '../db/notificationStore.js';

export interface NotificationDraft {
  kind: NotificationKind;
  title: string;
  body: string;
}

/** Keep bodies short and free of code/secrets (CLAUDE.md). */
function clip(s: string, max = 140): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Map a task event (from the agent runner's event stream) to a notification, or null if the
 * event isn't notification-worthy. Pure + testable. Only safe, summary text is included.
 */
export function taskEventToNotification(type: string, payload: unknown): NotificationDraft | null {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  switch (type) {
    case 'agent.permission_request': {
      const tool = typeof p.toolName === 'string' ? p.toolName : 'A tool';
      return { kind: 'approval', title: 'Approval needed', body: `${tool} needs your approval.` };
    }
    case 'task.completed': {
      const status = p.status;
      if (status === 'failed') {
        return { kind: 'taskFailed', title: 'Task failed', body: 'A task failed — open to see details.' };
      }
      return { kind: 'taskDone', title: 'Task finished', body: 'Your task finished successfully.' };
    }
    case 'task.error':
      return { kind: 'taskFailed', title: 'Task failed', body: 'A task failed — open to see details.' };
    default:
      return null;
  }
}

/**
 * Map a build event (from the build log stream) to a notification, or null. Pure + testable.
 */
export function buildEventToNotification(type: string, payload: unknown): NotificationDraft | null {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  switch (type) {
    case 'build.completed':
      return { kind: 'buildReady', title: 'Build ready', body: 'The APK built successfully.' };
    case 'build.error': {
      const reason = typeof p.reason === 'string' ? clip(p.reason) : 'The build failed.';
      return { kind: 'buildFailed', title: 'Build failed', body: reason };
    }
    case 'build.upload_completed':
      return { kind: 'shipped', title: 'Shipped to testers', body: 'The build was uploaded to testers.' };
    case 'build.upload_error': {
      const reason = typeof p.reason === 'string' ? clip(p.reason) : 'The upload failed.';
      return { kind: 'uploadFailed', title: 'Upload failed', body: reason };
    }
    default:
      return null;
  }
}
