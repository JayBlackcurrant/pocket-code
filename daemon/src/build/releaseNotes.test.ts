import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { parseProjectManifest } from '../config/projectManifest.js';
import { ProjectRegistry } from '../registry/projectRegistry.js';
import { openDb, type Db } from '../db/db.js';
import { TaskStore } from '../db/taskStore.js';
import type { DiffFileSummary } from '../git/gitService.js';
import type { QueryFn } from '../agent/agentRunner.js';
import {
  bulletsFromDiff,
  parseBullets,
  ReleaseNotesService,
  type DiffProvider,
} from './releaseNotes.js';

let db: Db;
let tasks: TaskStore;

const MANIFEST = `
id: hedged
path: /tmp/hedged
build:
  apk: "fvm flutter build apk --flavor staging --release"
signing:
  mode: in-repo
git:
  remote: origin
  base: stag
`;

function registry(): ProjectRegistry {
  return new ProjectRegistry([parseProjectManifest(MANIFEST, 'test')], ['/tmp'], {});
}

/** A fake SDK query() that yields a success result with the given text. */
function fakeQuery(resultText: string): QueryFn {
  return () => {
    const gen = (async function* () {
      yield { type: 'system', subtype: 'init', session_id: 's' } as unknown as SDKMessage;
      yield {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: resultText,
        session_id: 's',
      } as unknown as SDKMessage;
    })();
    const q = gen as unknown as Query;
    (q as unknown as { interrupt: () => Promise<void> }).interrupt = async () => undefined;
    return q;
  };
}

function throwingQuery(): QueryFn {
  return () => {
    throw new Error('session gone');
  };
}

function diffStub(files: DiffFileSummary[]): DiffProvider {
  return { diffSummary: async () => files };
}

function file(path: string, status: DiffFileSummary['status']): DiffFileSummary {
  return { path, status, additions: 1, deletions: 0, binary: false };
}

function taskWithSession(id: string, sessionId?: string): void {
  tasks.create({ id, projectId: 'hedged', branch: 'claude/x', worktree: '/tmp/hedged/.worktrees/' + id });
  if (sessionId) tasks.setSession(id, sessionId);
}

beforeEach(() => {
  db = openDb(':memory:');
  tasks = new TaskStore(db);
});

afterEach(() => db.close());

describe('parseBullets', () => {
  it('strips bullet markers and caps at 8', () => {
    const text = Array.from({ length: 12 }, (_, i) => `- item ${i}`).join('\n');
    const bullets = parseBullets(text);
    expect(bullets).toHaveLength(8);
    expect(bullets[0]).toBe('item 0');
  });

  it('prefers explicit bullet lines and drops preamble', () => {
    const text = 'Here are the notes:\n- Fixed login\n* Faster sync\n1. New settings';
    expect(parseBullets(text)).toEqual(['Fixed login', 'Faster sync', 'New settings']);
  });

  it('falls back to non-empty lines when there are no bullets', () => {
    expect(parseBullets('Fixed login\n\nFaster sync')).toEqual(['Fixed login', 'Faster sync']);
  });
});

describe('bulletsFromDiff', () => {
  it('maps statuses to verbs and ignores generated files', () => {
    const bullets = bulletsFromDiff([
      file('lib/a.dart', 'modified'),
      file('lib/b.dart', 'added'),
      file('lib/a.g.dart', 'modified'),
      file('old.dart', 'deleted'),
    ]);
    expect(bullets).toContain('Updated lib/a.dart');
    expect(bullets).toContain('Added lib/b.dart');
    expect(bullets).toContain('Removed old.dart');
    expect(bullets.some((b) => b.includes('.g.dart'))).toBe(false);
  });

  it('summarizes overflow with a "…and N more" bullet, capped at 8', () => {
    const files = Array.from({ length: 10 }, (_, i) => file(`lib/f${i}.dart`, 'modified'));
    const bullets = bulletsFromDiff(files);
    expect(bullets).toHaveLength(8);
    expect(bullets[7]).toMatch(/and 3 more/);
  });
});

describe('ReleaseNotesService.generate', () => {
  it('uses the task session when available', async () => {
    taskWithSession('t1', 's-123');
    const svc = new ReleaseNotesService({
      registry: registry(),
      tasks,
      git: diffStub([]),
      query: fakeQuery('- Fixed login\n- Faster sync'),
    });
    const res = await svc.generate('t1');
    expect(res.source).toBe('session');
    expect(res.notes).toEqual(['Fixed login', 'Faster sync']);
  });

  it('falls back to the diff when there is no session', async () => {
    taskWithSession('t1'); // no sessionId
    const svc = new ReleaseNotesService({
      registry: registry(),
      tasks,
      git: diffStub([file('lib/a.dart', 'modified')]),
      query: fakeQuery('- unused'),
    });
    const res = await svc.generate('t1');
    expect(res.source).toBe('diff');
    expect(res.notes).toEqual(['Updated lib/a.dart']);
  });

  it('falls back to the diff when the session query fails', async () => {
    taskWithSession('t1', 's-123');
    const svc = new ReleaseNotesService({
      registry: registry(),
      tasks,
      git: diffStub([file('lib/a.dart', 'added')]),
      query: throwingQuery(),
    });
    const res = await svc.generate('t1');
    expect(res.source).toBe('diff');
    expect(res.notes).toEqual(['Added lib/a.dart']);
  });

  it('falls back to the diff when the session returns no bullets', async () => {
    taskWithSession('t1', 's-123');
    const svc = new ReleaseNotesService({
      registry: registry(),
      tasks,
      git: diffStub([file('lib/a.dart', 'modified')]),
      query: fakeQuery('   \n\n'),
    });
    const res = await svc.generate('t1');
    expect(res.source).toBe('diff');
  });

  it('throws for an unknown task', async () => {
    const svc = new ReleaseNotesService({ registry: registry(), tasks, git: diffStub([]), query: null });
    await expect(svc.generate('nope')).rejects.toThrow(/unknown task/);
  });

  it('throws when the task has no branch yet', async () => {
    tasks.create({ id: 't1', projectId: 'hedged', branch: '', worktree: '' });
    const svc = new ReleaseNotesService({ registry: registry(), tasks, git: diffStub([]), query: null });
    await expect(svc.generate('t1')).rejects.toThrow(/no branch/);
  });
});
