import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseProjectManifest } from '../config/projectManifest.js';
import { ProjectRegistry } from '../registry/projectRegistry.js';
import { openDb, type Db } from '../db/db.js';
import { BuildStore } from '../db/buildStore.js';
import { BuildLog } from '../db/buildLog.js';
import type { RunStep } from './buildService.js';
import { buildUploadArgv, DistributionService } from './distributionService.js';
import { verifyDownloadToken } from './downloadToken.js';

let repo: string;
let db: Db;
let store: BuildStore;
let buildLog: BuildLog;

const UPLOAD_CMD =
  'firebase appdistribution:distribute {apk} --app {appId} --groups {groups} --release-notes-file {notesFile}';

function manifest(
  repoPath: string,
  opts: { firebaseProject?: string; appId?: string; groups?: string[]; forbidProject?: string } = {},
): string {
  const groups = opts.groups ?? ['internal'];
  return `
id: hedged
displayName: Hedged (staging)
path: ${repoPath}
flutter: fvm
flavorDefault: staging
allowedFlavors: [staging]
build:
  apk: "fvm flutter build apk --flavor staging --release"
signing:
  mode: in-repo
git:
  remote: origin
  base: stag
distribution:
  firebaseAppDistribution:
    firebaseProject: ${opts.firebaseProject ?? 'hedged-core-staging'}
    appId: "${opts.appId ?? '1:123456:android:abcdef'}"
    groups: [${groups.join(', ')}]
    serviceAccountEnv: GOOGLE_APPLICATION_CREDENTIALS
    uploadCmd: "${UPLOAD_CMD}"
guardrails:
  forbidFirebaseProjects: [${opts.forbidProject ?? 'hedged-core-production'}]
`;
}

function mkRegistry(yamlText: string): ProjectRegistry {
  return new ProjectRegistry([parseProjectManifest(yamlText, 'test')], [repo], {});
}

function mkService(
  registry: ProjectRegistry,
  runStep: RunStep,
  env: NodeJS.ProcessEnv = { GOOGLE_APPLICATION_CREDENTIALS: '/fake/creds.json' },
): DistributionService {
  return new DistributionService({ registry, builds: store, buildLog, runStep, env });
}

/** A succeeded build with a real APK file on disk. */
function succeededBuild(id = 'b1'): string {
  store.create({ id, projectId: 'hedged', cwd: repo });
  const apk = join(repo, 'app-staging-release.apk');
  writeFileSync(apk, 'APKBYTES');
  store.markSucceeded(id, apk);
  return apk;
}

beforeEach(() => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), 'pc-dist-')));
  db = openDb(join(repo, 'data', 'test.sqlite'));
  store = new BuildStore(db);
  buildLog = new BuildLog(db);
});

afterEach(() => {
  db.close();
  rmSync(repo, { recursive: true, force: true });
});

describe('buildUploadArgv', () => {
  it('substitutes placeholders per token, keeping a spaced path as one argument', () => {
    const argv = buildUploadArgv(UPLOAD_CMD, {
      apk: '/Users/me/My Builds/app.apk',
      appId: '1:2:android:3',
      groups: 'internal,qa',
      notesFile: '/tmp/notes.txt',
    });
    expect(argv.cmd).toBe('firebase');
    expect(argv.args).toEqual([
      'appdistribution:distribute',
      '/Users/me/My Builds/app.apk',
      '--app',
      '1:2:android:3',
      '--groups',
      'internal,qa',
      '--release-notes-file',
      '/tmp/notes.txt',
    ]);
  });
});

describe('DistributionService.upload', () => {
  it('uploads a succeeded build, passing the APK, groups, and a release-notes file', async () => {
    const apk = succeededBuild();
    let seenArgs: string[] = [];
    let notesContent = '';
    const runStep: RunStep = async ({ argv, onLine }) => {
      seenArgs = argv!.args;
      const notesPath = argv!.args[argv!.args.indexOf('--release-notes-file') + 1]!;
      notesContent = readFileSync(notesPath, 'utf8');
      onLine('stdout', 'Uploading APK...');
      onLine('stdout', 'View this release in the Firebase console: https://console.firebase.google.com/project/x/appdistribution/app/y/releases/z');
      return { code: 0 };
    };
    const svc = mkService(mkRegistry(manifest(repo)), runStep);

    svc.upload('b1', { releaseNotes: 'Line one\nLine two', groups: ['internal', 'qa'] });
    await svc.whenSettled('b1');

    expect(seenArgs).toContain(apk);
    expect(seenArgs).toContain('internal,qa');
    expect(notesContent).toBe('Line one\nLine two');

    const row = store.get('b1')!;
    expect(row.uploadStatus).toBe('uploaded');
    expect(row.releaseUrl).toMatch(/console\.firebase\.google\.com/);

    const types = buildLog.since('b1', 0).map((e) => e.type);
    expect(types).toContain('build.upload_started');
    expect(types).toContain('build.upload_log');
    expect(types).toContain('build.upload_completed');
  });

  it('cleans up the temp notes dir after the upload', async () => {
    succeededBuild();
    let notesPath = '';
    const runStep: RunStep = async ({ argv }) => {
      notesPath = argv!.args[argv!.args.indexOf('--release-notes-file') + 1]!;
      return { code: 0 };
    };
    const svc = mkService(mkRegistry(manifest(repo)), runStep);
    svc.upload('b1');
    await svc.whenSettled('b1');
    expect(notesPath).not.toBe('');
    expect(() => readFileSync(notesPath, 'utf8')).toThrow();
  });

  it('marks the upload failed when the CLI exits non-zero', async () => {
    succeededBuild();
    const runStep: RunStep = async ({ onLine }) => {
      onLine('stderr', 'Error: permission denied');
      return { code: 1 };
    };
    const svc = mkService(mkRegistry(manifest(repo)), runStep);
    svc.upload('b1');
    await svc.whenSettled('b1');
    const row = store.get('b1')!;
    expect(row.uploadStatus).toBe('failed');
    expect(row.uploadError).toMatch(/code 1/);
  });

  it('refuses a guardrail-forbidden Firebase project', () => {
    succeededBuild();
    const runStep: RunStep = async () => ({ code: 0 });
    const reg = mkRegistry(
      manifest(repo, { firebaseProject: 'hedged-core-production', forbidProject: 'hedged-core-production' }),
    );
    const svc = mkService(reg, runStep);
    expect(() => svc.upload('b1')).toThrow(/production/);
    expect(store.get('b1')!.uploadStatus).toBeNull();
  });

  it('refuses when the appId is still a placeholder', () => {
    succeededBuild();
    const svc = mkService(mkRegistry(manifest(repo, { appId: '<STAGING_ANDROID_APP_ID>' })), async () => ({ code: 0 }));
    expect(() => svc.upload('b1')).toThrow(/placeholder/);
  });

  it('refuses when the service-account credential env is not set', () => {
    succeededBuild();
    const svc = mkService(mkRegistry(manifest(repo)), async () => ({ code: 0 }), {});
    expect(() => svc.upload('b1')).toThrow(/credential/);
  });

  it('refuses to upload a build that has not succeeded', () => {
    store.create({ id: 'b1', projectId: 'hedged', cwd: repo }); // status: queued
    const svc = mkService(mkRegistry(manifest(repo)), async () => ({ code: 0 }));
    expect(() => svc.upload('b1')).toThrow(/not succeeded/);
  });

  it('refuses when the APK artifact is missing on disk', () => {
    store.create({ id: 'b1', projectId: 'hedged', cwd: repo });
    store.markSucceeded('b1', join(repo, 'does-not-exist.apk'));
    const svc = mkService(mkRegistry(manifest(repo)), async () => ({ code: 0 }));
    expect(() => svc.upload('b1')).toThrow(/no APK artifact/);
  });
});

function tailscaleManifest(repoPath: string): string {
  return `
id: hedged
displayName: Hedged (staging)
path: ${repoPath}
flutter: fvm
flavorDefault: staging
allowedFlavors: [staging]
build:
  apk: "fvm flutter build apk --flavor staging --release"
signing:
  mode: in-repo
git:
  remote: origin
  base: stag
distribution:
  tailscaleServe:
    linkTtlMinutes: 10080
`;
}

const ADVERTISE_URL = 'https://mac.tail1234.ts.net';
const DL_SECRET = 'tailscale-test-secret-1234567890';

describe('DistributionService.upload — tailscaleServe (keyless)', () => {
  it('serves a signed download link without any credential and never runs a command', async () => {
    succeededBuild();
    let ranCommand = false;
    const svc = new DistributionService({
      registry: mkRegistry(tailscaleManifest(repo)),
      builds: store,
      buildLog,
      runStep: async () => {
        ranCommand = true;
        return { code: 0 };
      },
      env: {}, // no GOOGLE_APPLICATION_CREDENTIALS — must not be required
      advertiseUrl: ADVERTISE_URL,
      downloadSecret: DL_SECRET,
    });

    svc.upload('b1');
    await svc.whenSettled('b1');

    expect(ranCommand).toBe(false); // keyless path spawns nothing

    const row = store.get('b1')!;
    expect(row.uploadStatus).toBe('uploaded');
    expect(row.releaseUrl).not.toBeNull();

    const url = new URL(row.releaseUrl!);
    expect(url.origin).toBe(ADVERTISE_URL);
    expect(url.pathname).toBe('/builds/b1/apk');
    const token = url.searchParams.get('t')!;
    expect(verifyDownloadToken(DL_SECRET, 'b1', token)).toBe(true);
    expect(verifyDownloadToken(DL_SECRET, 'other', token)).toBe(false);

    const types = buildLog.since('b1', 0).map((e) => e.type);
    expect(types).toContain('build.upload_started');
    expect(types).toContain('build.upload_completed');
  });

  it('fails cleanly when no advertise URL is configured', async () => {
    succeededBuild();
    const svc = new DistributionService({
      registry: mkRegistry(tailscaleManifest(repo)),
      builds: store,
      buildLog,
      env: {},
      advertiseUrl: '', // RELAYD_ADVERTISE_URL unset
      downloadSecret: DL_SECRET,
    });
    svc.upload('b1');
    await svc.whenSettled('b1');
    const row = store.get('b1')!;
    expect(row.uploadStatus).toBe('failed');
    expect(row.uploadError).toMatch(/advertise URL/);
  });
});
