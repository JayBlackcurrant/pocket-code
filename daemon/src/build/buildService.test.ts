import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseProjectManifest } from '../config/projectManifest.js';
import { ProjectRegistry } from '../registry/projectRegistry.js';
import { openDb, type Db } from '../db/db.js';
import { BuildStore } from '../db/buildStore.js';
import { BuildLog, type StoredBuildEvent } from '../db/buildLog.js';
import { TaskStore } from '../db/taskStore.js';
import {
  BuildService,
  caffeinateWrap,
  makeSpawnRunStep,
  tokenizeCommand,
  type RunStep,
} from './buildService.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let repo: string;
let db: Db;

function manifest(repoPath: string, opts: { requiresSibling?: string } = {}): string {
  return `
id: hedged
path: ${repoPath}
flutter: fvm
flavorDefault: staging
allowedFlavors:
  - staging
codegen:
${opts.requiresSibling ? `  requiresSibling: ${opts.requiresSibling}\n` : ''}  steps:
    - "fvm flutter pub get"
    - "fvm dart run build_runner build"
build:
  apk: "fvm flutter build apk --flavor staging --release"
signing:
  mode: in-repo
git:
  remote: origin
  base: stag
guardrails:
  forbidFlavors: [production]
`;
}

function mkRegistry(yamlText: string): ProjectRegistry {
  const m = parseProjectManifest(yamlText, 'test');
  return new ProjectRegistry([m], [repo], {});
}

function mkService(registry: ProjectRegistry, runStep: RunStep): BuildService {
  return new BuildService({
    registry,
    builds: new BuildStore(db),
    buildLog: new BuildLog(db),
    tasks: new TaskStore(db),
    runStep,
  });
}

beforeEach(() => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), 'pc-build-')));
  db = openDb(join(repo, 'data', 'test.sqlite'));
});

afterEach(() => {
  db.close();
  rmSync(repo, { recursive: true, force: true });
});

describe('tokenizeCommand', () => {
  it('splits a plain command string into cmd + args', () => {
    expect(tokenizeCommand('fvm flutter build apk --flavor staging --release')).toEqual({
      cmd: 'fvm',
      args: ['flutter', 'build', 'apk', '--flavor', 'staging', '--release'],
    });
  });

  it('handles a single-token command', () => {
    expect(tokenizeCommand('./dart-api-generator.sh')).toEqual({
      cmd: './dart-api-generator.sh',
      args: [],
    });
  });

  it('throws on an empty command', () => {
    expect(() => tokenizeCommand('   ')).toThrow();
  });
});

describe('caffeinateWrap (S3-08)', () => {
  it('wraps a command in `caffeinate -i` on macOS when enabled', () => {
    const w = caffeinateWrap('fvm', ['flutter', 'build', 'apk'], {
      enabled: true,
      platform: 'darwin',
    });
    expect(w).toEqual({ cmd: 'caffeinate', args: ['-i', 'fvm', 'flutter', 'build', 'apk'] });
  });

  it('leaves the command unchanged on non-macOS', () => {
    const w = caffeinateWrap('fvm', ['build'], { enabled: true, platform: 'linux' });
    expect(w).toEqual({ cmd: 'fvm', args: ['build'] });
  });

  it('leaves the command unchanged when disabled', () => {
    const w = caffeinateWrap('fvm', ['build'], { enabled: false, platform: 'darwin' });
    expect(w).toEqual({ cmd: 'fvm', args: ['build'] });
  });
});

describe('makeSpawnRunStep (S3-08)', () => {
  it('runs a real command and streams its output (under caffeinate on macOS)', async () => {
    const run = makeSpawnRunStep({ caffeinate: true });
    const lines: string[] = [];
    const result = await run({
      command: 'echo pocketcode-s3-08',
      cwd: repo,
      signal: new AbortController().signal,
      onLine: (_stream, line) => lines.push(line),
    });
    expect(result.code).toBe(0);
    expect(lines.join('\n')).toContain('pocketcode-s3-08');
  });
});

describe('BuildService', () => {
  it('runs codegen steps then the APK build in order, streaming log lines', async () => {
    const commands: string[] = [];
    const runStep: RunStep = async ({ command, onLine }) => {
      commands.push(command);
      onLine('stdout', `starting ${command}`);
      return { code: 0 };
    };
    const svc = mkService(mkRegistry(manifest(repo)), runStep);

    const build = svc.enqueue({ projectId: 'hedged' });
    expect(build.status).toBe('queued');
    expect(build.flavor).toBe('staging');
    await svc.whenSettled(build.id);

    expect(commands).toEqual([
      'fvm flutter pub get',
      'fvm dart run build_runner build',
      'fvm flutter build apk --flavor staging --release',
    ]);
    expect(svc.get(build.id)?.status).toBe('succeeded');

    const types = svc.logsSince(build.id, 0).map((e) => e.type);
    expect(types).toContain('build.created');
    expect(types).toContain('build.started');
    expect(types.filter((t) => t === 'build.step')).toHaveLength(3);
    expect(types).toContain('build.log');
    expect(types).toContain('build.completed');
  });

  it('skips codegen when runCodegen is false', async () => {
    const commands: string[] = [];
    const runStep: RunStep = async ({ command }) => {
      commands.push(command);
      return { code: 0 };
    };
    const svc = mkService(mkRegistry(manifest(repo)), runStep);
    const build = svc.enqueue({ projectId: 'hedged', runCodegen: false });
    await svc.whenSettled(build.id);
    expect(commands).toEqual(['fvm flutter build apk --flavor staging --release']);
  });

  it('runs builds one at a time (never concurrently)', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const runStep: RunStep = async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await sleep(5);
      concurrent--;
      return { code: 0 };
    };
    const svc = mkService(mkRegistry(manifest(repo)), runStep);

    const a = svc.enqueue({ projectId: 'hedged' });
    const b = svc.enqueue({ projectId: 'hedged' });
    await Promise.all([svc.whenSettled(a.id), svc.whenSettled(b.id)]);

    expect(maxConcurrent).toBe(1);
    expect(svc.get(a.id)?.status).toBe('succeeded');
    expect(svc.get(b.id)?.status).toBe('succeeded');
  });

  it('fails the build when a step exits non-zero and stops the pipeline', async () => {
    const commands: string[] = [];
    const runStep: RunStep = async ({ command }) => {
      commands.push(command);
      return { code: command.includes('pub get') ? 2 : 0 };
    };
    const svc = mkService(mkRegistry(manifest(repo)), runStep);
    const build = svc.enqueue({ projectId: 'hedged' });
    await svc.whenSettled(build.id);

    // The first step failed, so later steps never ran.
    expect(commands).toEqual(['fvm flutter pub get']);
    const row = svc.get(build.id);
    expect(row?.status).toBe('failed');
    expect(row?.exitCode).toBe(2);
    const errEvent = svc.logsSince(build.id, 0).find((e) => e.type === 'build.error');
    expect(errEvent).toBeDefined();
  });

  it('refuses a guardrail-forbidden flavor at enqueue (never creates the build)', () => {
    const runStep: RunStep = async () => ({ code: 0 });
    const svc = mkService(mkRegistry(manifest(repo)), runStep);
    expect(() => svc.enqueue({ projectId: 'hedged', flavor: 'production' })).toThrow(/production/);
    expect(svc.listForProject('hedged')).toHaveLength(0);
  });

  it('fails clearly when codegen requires a sibling checkout that is missing', async () => {
    const runStep: RunStep = async () => ({ code: 0 });
    const svc = mkService(mkRegistry(manifest(repo, { requiresSibling: '../missing-backend' })), runStep);
    const build = svc.enqueue({ projectId: 'hedged' });
    await svc.whenSettled(build.id);
    const row = svc.get(build.id);
    expect(row?.status).toBe('failed');
    expect(row?.error).toMatch(/missing-backend/);
  });

  it('cancels a running build', async () => {
    const runStep: RunStep = ({ signal }) =>
      new Promise((resolve) => {
        if (signal.aborted) return resolve({ code: 1 });
        signal.addEventListener('abort', () => resolve({ code: 1 }), { once: true });
      });
    const svc = mkService(mkRegistry(manifest(repo)), runStep);
    const build = svc.enqueue({ projectId: 'hedged' });
    await sleep(10);
    expect(svc.get(build.id)?.status).toBe('running');

    expect(svc.cancel(build.id)).toBe(true);
    await svc.whenSettled(build.id);
    expect(svc.get(build.id)?.status).toBe('cancelled');
  });

  it('cancels a queued build without running it', async () => {
    const commands: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const runStep: RunStep = async ({ command }) => {
      commands.push(command);
      await gate; // hold the first build so the second stays queued
      return { code: 0 };
    };
    const svc = mkService(mkRegistry(manifest(repo)), runStep);

    const first = svc.enqueue({ projectId: 'hedged' });
    const second = svc.enqueue({ projectId: 'hedged' });
    await sleep(10);

    expect(svc.cancel(second.id)).toBe(true);
    expect(svc.get(second.id)?.status).toBe('cancelled');

    release();
    await Promise.all([svc.whenSettled(first.id), svc.whenSettled(second.id)]);
    expect(svc.get(first.id)?.status).toBe('succeeded');
    // Only the first build's 3 steps ran; the cancelled build never executed a step.
    expect(commands).toHaveLength(3);
  });

  it('includes the failing command in the failure reason', async () => {
    const runStep: RunStep = async ({ command }) => ({ code: command.includes('pub get') ? 3 : 0 });
    const svc = mkService(mkRegistry(manifest(repo)), runStep);
    const build = svc.enqueue({ projectId: 'hedged' });
    await svc.whenSettled(build.id);
    expect(svc.get(build.id)?.error).toContain('fvm flutter pub get');
  });

  it('exposes the tail of the log via lastLogLines', async () => {
    const runStep: RunStep = async ({ onLine }) => {
      onLine('stdout', 'line A');
      onLine('stdout', 'line B');
      onLine('stderr', 'line C');
      return { code: 0 };
    };
    const svc = mkService(mkRegistry(manifest(repo)), runStep);
    const build = svc.enqueue({ projectId: 'hedged', runCodegen: false });
    await svc.whenSettled(build.id);

    const tail = svc.lastLogLines(build.id, 2);
    expect(tail).toHaveLength(2);
    const lines = tail.map((e) => (e.payload as { line: string }).line);
    expect(lines).toEqual(['line B', 'line C']);
  });

  it('retries a finished build as a new build with the same settings + lineage', async () => {
    const runStep: RunStep = async () => ({ code: 0 });
    const svc = mkService(mkRegistry(manifest(repo)), runStep);
    const first = svc.enqueue({ projectId: 'hedged', runCodegen: false });
    await svc.whenSettled(first.id);
    expect(svc.get(first.id)?.status).toBe('succeeded');

    const retry = svc.retry(first.id);
    expect(retry.id).not.toBe(first.id);
    expect(retry.retryOf).toBe(first.id);
    expect(retry.runCodegen).toBe(false);
    expect(retry.flavor).toBe('staging');
    await svc.whenSettled(retry.id);
    expect(svc.get(retry.id)?.status).toBe('succeeded');
  });

  it('refuses to retry a build that is still running', async () => {
    const gate = new Promise<void>(() => {}); // never resolves
    const runStep: RunStep = () => gate.then(() => ({ code: 0 }));
    const svc = mkService(mkRegistry(manifest(repo)), runStep);
    const build = svc.enqueue({ projectId: 'hedged' });
    await sleep(10);
    expect(svc.get(build.id)?.status).toBe('running');
    expect(() => svc.retry(build.id)).toThrow(/running/);
  });

  it('replays build events in seq order via logsSince', async () => {
    const events: StoredBuildEvent[] = [];
    const runStep: RunStep = async ({ onLine }) => {
      onLine('stdout', 'line-1');
      onLine('stdout', 'line-2');
      return { code: 0 };
    };
    const svc = mkService(mkRegistry(manifest(repo)), runStep);
    svc.onEvent((e) => events.push(e));
    const build = svc.enqueue({ projectId: 'hedged' });
    await svc.whenSettled(build.id);

    const seqs = svc.logsSince(build.id, 0).map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    // Emitted events match what was persisted.
    expect(events.filter((e) => e.buildId === build.id).length).toBe(seqs.length);
  });

  it('runs a codegen step in the subdirectory named by `dir`', async () => {
    const seen: Array<{ command: string; cwd: string }> = [];
    const runStep: RunStep = async ({ command, cwd }) => {
      seen.push({ command, cwd });
      return { code: 0 };
    };
    const yaml = `
id: hedged
path: ${repo}
flavorDefault: staging
allowedFlavors: [staging]
codegen:
  steps:
    - "fvm flutter pub get"
    - run: "fvm dart run build_runner build --delete-conflicting-outputs"
      dir: api
    - "fvm dart run build_runner build --delete-conflicting-outputs"
build:
  apk: "fvm flutter build apk --flavor staging --release"
signing:
  mode: in-repo
git:
  remote: origin
  base: stag
`;
    const svc = mkService(mkRegistry(yaml), runStep);
    const build = svc.enqueue({ projectId: 'hedged' });
    await svc.whenSettled(build.id);

    expect(svc.get(build.id)?.status).toBe('succeeded');
    // 4 steps: pub get (root), build_runner (api), build_runner (root), apk (root).
    expect(seen).toHaveLength(4);
    expect(seen[1]!.cwd).toBe(join(repo, 'api')); // the api step ran in the subdirectory
    expect(seen[0]!.cwd).toBe(seen[2]!.cwd); // the others ran at the worktree root
    expect(seen[0]!.cwd).toBe(seen[3]!.cwd);
    expect(seen[1]!.cwd).not.toBe(seen[0]!.cwd);

    // The build.step event records the dir for the subdir step.
    const stepEvents = svc.logsSince(build.id, 0).filter((e) => e.type === 'build.step');
    expect((stepEvents[1]!.payload as { dir?: string }).dir).toBe('api');
  });

  it('fails the build when a codegen step `dir` escapes the project directory', async () => {
    const runStep: RunStep = async () => ({ code: 0 });
    const yaml = `
id: hedged
path: ${repo}
flavorDefault: staging
allowedFlavors: [staging]
codegen:
  steps:
    - run: "fvm dart run build_runner build"
      dir: "../escape"
build:
  apk: "fvm flutter build apk --flavor staging --release"
signing:
  mode: in-repo
git:
  remote: origin
  base: stag
`;
    const svc = mkService(mkRegistry(yaml), runStep);
    const build = svc.enqueue({ projectId: 'hedged' });
    await svc.whenSettled(build.id);
    const row = svc.get(build.id);
    expect(row?.status).toBe('failed');
    expect(row?.error).toMatch(/escapes the project directory/);
  });
});
