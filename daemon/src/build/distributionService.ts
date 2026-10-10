import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectManifest } from '../config/projectManifest.js';
import type { ProjectRegistry } from '../registry/projectRegistry.js';
import type { BuildStore } from '../db/buildStore.js';
import type { BuildLog } from '../db/buildLog.js';
import { firebaseProjectBlockedReason } from '../guardrails.js';
import { spawnRunStep, tokenizeCommand, type RunStep, type BuildLogger } from './buildService.js';

const noopLogger: BuildLogger = { info: () => {}, warn: () => {}, error: () => {} };

/** Cap release notes so a huge body can't bloat the temp file / command. */
const MAX_NOTES_LEN = 20_000;
const MAX_LINE_LEN = 4000;

export class DistributionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DistributionError';
  }
}

export interface DistributionServiceDeps {
  registry: ProjectRegistry;
  builds: BuildStore;
  buildLog: BuildLog;
  /** Defaults to the real spawn-based runner. Tests pass a fake. */
  runStep?: RunStep;
  logger?: BuildLogger;
  /** Env to read the service-account credential from. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

export interface UploadInput {
  /** Tester-facing release notes (editable in the app, S3-03). */
  releaseNotes?: string;
  /** Override the manifest's tester groups. */
  groups?: string[];
}

/** Substitute `{token}` placeholders in a single argv element (keeps paths with spaces as
 *  one argument). Only the known tokens are replaced. */
function substitute(arg: string, values: Record<string, string>): string {
  let out = arg;
  for (const [key, value] of Object.entries(values)) {
    out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}

/** Build the firebase CLI argv from the manifest's uploadCmd template. Tokenizing first and
 *  substituting per-token means an APK/notes path may contain spaces without breaking argv. */
export function buildUploadArgv(
  template: string,
  values: Record<string, string>,
): { cmd: string; args: string[] } {
  const { cmd, args } = tokenizeCommand(template);
  return { cmd: substitute(cmd, values), args: args.map((a) => substitute(a, values)) };
}

/** Pick the last Firebase console URL printed by the CLI, if any (best-effort). */
function parseReleaseUrl(lines: string[]): string | null {
  let url: string | null = null;
  for (const line of lines) {
    const m = line.match(/https:\/\/console\.firebase\.google\.com\/\S+/);
    if (m) url = m[0];
  }
  return url;
}

/**
 * Distribution service (S3-02): uploads a succeeded build's APK to Firebase App Distribution
 * via the Firebase CLI with a service account, tester groups, and a release-notes file.
 * Output streams into the same build log (so `/builds/:id/stream` shows upload progress),
 * and the staging-only guardrail refuses a forbidden Firebase project before anything runs.
 */
export class DistributionService {
  private readonly registry: ProjectRegistry;
  private readonly builds: BuildStore;
  private readonly buildLog: BuildLog;
  private readonly runStep: RunStep;
  private readonly env: NodeJS.ProcessEnv;
  private log: BuildLogger;

  private readonly settled = new Map<string, Promise<void>>();

  constructor(deps: DistributionServiceDeps) {
    this.registry = deps.registry;
    this.builds = deps.builds;
    this.buildLog = deps.buildLog;
    this.runStep = deps.runStep ?? spawnRunStep;
    this.env = deps.env ?? process.env;
    this.log = deps.logger ?? noopLogger;
  }

  setLogger(logger: BuildLogger): void {
    this.log = logger;
  }

  /** Resolves when the upload has fully settled (for tests/shutdown). */
  whenSettled(buildId: string): Promise<void> {
    return this.settled.get(buildId) ?? Promise.resolve();
  }

  private persist(buildId: string, type: string, payload: unknown): void {
    this.buildLog.append(buildId, type, payload);
  }

  /**
   * Validate and start an upload for a succeeded build. Returns once validation passes; the
   * upload runs in the background (awaitable via whenSettled). Throws DistributionError on a
   * validation failure (bad state, guardrail, missing config) so the caller can 409.
   */
  upload(buildId: string, input: UploadInput = {}): void {
    const build = this.builds.get(buildId);
    if (!build) throw new DistributionError(`unknown build: "${buildId}"`);
    if (build.status !== 'succeeded') {
      throw new DistributionError(`build "${buildId}" is not succeeded (status: ${build.status})`);
    }
    if (build.uploadStatus === 'uploading') {
      throw new DistributionError(`build "${buildId}" is already uploading`);
    }
    if (!build.artifact || !existsSync(build.artifact)) {
      throw new DistributionError(`build "${buildId}" has no APK artifact on disk`);
    }

    const project = this.registry.getActive(build.projectId);
    if (!project?.resolvedPath) {
      throw new DistributionError(`project not active: "${build.projectId}"`);
    }
    const manifest = project.manifest;
    const dist = manifest.distribution.firebaseAppDistribution;
    if (!dist) {
      throw new DistributionError(`project "${manifest.id}" has no firebaseAppDistribution configured`);
    }

    // Guardrail: refuse a forbidden Firebase project (e.g. production during the pilot).
    const blocked = firebaseProjectBlockedReason(manifest, dist.firebaseProject);
    if (blocked) throw new DistributionError(blocked);

    // Placeholders in the manifest mean the Firebase app has not been provisioned yet.
    if (/[<>]/.test(dist.appId)) {
      throw new DistributionError(
        `Firebase appId is still a placeholder ("${dist.appId}") — provision the app and fill the manifest`,
      );
    }
    const groups = input.groups ?? dist.groups;
    if (groups.length === 0) {
      throw new DistributionError('no tester groups configured or provided');
    }
    if (groups.some((g) => /[<>]/.test(g))) {
      throw new DistributionError(`tester group is still a placeholder (${groups.join(', ')})`);
    }

    // Service-account credential must be present; never fall back to interactive login.
    const credVar = dist.serviceAccountEnv;
    if (!this.env[credVar]) {
      throw new DistributionError(
        `service-account credential env "${credVar}" is not set (required; interactive login is never used)`,
      );
    }

    const run = this.runUpload(buildId, {
      manifest,
      dist,
      apk: build.artifact,
      groups,
      releaseNotes: (input.releaseNotes ?? defaultNotes(manifest)).slice(0, MAX_NOTES_LEN),
      cwd: project.resolvedPath,
    });
    this.settled.set(buildId, run);
    run.catch(() => {
      /* failures are recorded as events + on the row; never crash the daemon */
    });
  }

  private async runUpload(
    buildId: string,
    args: {
      manifest: ProjectManifest;
      dist: NonNullable<ProjectManifest['distribution']['firebaseAppDistribution']>;
      apk: string;
      groups: string[];
      releaseNotes: string;
      cwd: string;
    },
  ): Promise<void> {
    const { dist, apk, groups, releaseNotes, cwd } = args;
    this.builds.markUploading(buildId);
    this.persist(buildId, 'build.upload_started', {
      firebaseProject: dist.firebaseProject,
      appId: dist.appId,
      groups,
    });
    this.log.info({ buildId, appId: dist.appId, groups }, 'upload started');

    // Write release notes to a temp file the Firebase CLI reads.
    const notesDir = mkdtempSync(join(tmpdir(), 'pc-notes-'));
    const notesFile = join(notesDir, 'release-notes.txt');
    writeFileSync(notesFile, releaseNotes, 'utf8');

    const lines: string[] = [];
    const abort = new AbortController();
    try {
      const argv = buildUploadArgv(dist.uploadCmd, {
        apk,
        appId: dist.appId,
        groups: groups.join(','),
        notesFile,
        firebaseProject: dist.firebaseProject,
      });

      const result = await this.runStep({
        command: `${argv.cmd} ${argv.args.join(' ')}`,
        argv,
        cwd,
        signal: abort.signal,
        onLine: (stream, line) => {
          const trimmed = line.length > MAX_LINE_LEN ? line.slice(0, MAX_LINE_LEN) : line;
          lines.push(trimmed);
          this.persist(buildId, 'build.upload_log', { stream, line: trimmed });
        },
      });

      if (result.code !== 0) {
        const reason = `firebase upload exited with code ${result.code}`;
        this.builds.markUploadFailed(buildId, reason);
        this.persist(buildId, 'build.upload_error', { reason, exitCode: result.code });
        this.log.error({ buildId, reason }, 'upload failed');
        return;
      }

      const releaseUrl = parseReleaseUrl(lines);
      this.builds.markUploaded(buildId, releaseUrl);
      this.persist(buildId, 'build.upload_completed', { releaseUrl });
      this.log.info({ buildId, releaseUrl }, 'upload completed');
    } catch (err) {
      const reason = `upload failed to run: ${err instanceof Error ? err.message : String(err)}`;
      this.builds.markUploadFailed(buildId, reason);
      this.persist(buildId, 'build.upload_error', { reason, exitCode: null });
      this.log.error({ buildId, reason }, 'upload failed');
    } finally {
      rmSync(notesDir, { recursive: true, force: true });
    }
  }
}

function defaultNotes(manifest: ProjectManifest): string {
  return `Build of ${manifest.displayName ?? manifest.id} (${manifest.flavorDefault ?? 'default'}).`;
}
