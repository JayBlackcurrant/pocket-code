import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * Daemon environment configuration, validated at startup.
 *
 * Security (CLAUDE.md): the daemon must bind only to the Tailscale interface or
 * 127.0.0.1 — never 0.0.0.0. We reject a public bind here rather than trusting the
 * operator to get it right.
 */
const EnvSchema = z.object({
  RELAYD_HOST: z.string().default('127.0.0.1'),
  RELAYD_PORT: z.coerce.number().int().positive().max(65535).default(8787),
  RELAYD_PROJECTS_DIR: z.string().default('./config/projects'),
  RELAYD_DB_PATH: z.string().default('./data/relayd.sqlite'),
  RELAYD_WORKSPACES_DIR: z.string().optional(),
  // Comma-separated absolute directories a registered repo path must resolve inside.
  // Any project (or later, file/worktree) path outside these is rejected.
  RELAYD_ALLOWED_ROOTS: z.string().optional(),
  // Base URL phones should connect to (e.g. the Tailscale MagicDNS URL). The pairing
  // QR uses this; it is NOT the bind address. Falls back to http://host:port.
  RELAYD_ADVERTISE_URL: z.string().url().optional(),
  // Command-execution sandbox for agent tasks (CLAUDE.md: on). Set to "off" only if a
  // build fails under the sandbox while you investigate.
  RELAYD_SANDBOX: z.enum(['on', 'off']).default('on'),
  // Auto-deny a pending phone approval after this many minutes so runs never hang (S2-03).
  RELAYD_APPROVAL_TIMEOUT_MINUTES: z.coerce.number().min(0).default(120),
  // Wrap long build/upload jobs in `caffeinate -i` so the Mac doesn't idle-sleep mid-build
  // (S3-08). macOS only; no-op elsewhere. Set "off" to disable.
  RELAYD_CAFFEINATE: z.enum(['on', 'off']).default('on'),
  // Secret used to sign Tailscale-served APK download links. If unset, a random per-process
  // secret is used — links then become invalid after a daemon restart (just re-ship). Set a
  // stable value in env.sh to keep download links valid across restarts.
  RELAYD_DOWNLOAD_SECRET: z.string().min(16).optional(),
});

export type DaemonEnv = {
  host: string;
  port: number;
  projectsDir: string;
  dbPath: string;
  workspacesDir: string | undefined;
  allowedRoots: string[];
  advertiseUrl: string;
  sandboxEnabled: boolean;
  approvalTimeoutMs: number;
  caffeinate: boolean;
  downloadSecret: string;
};

/** Hosts that would expose the daemon publicly. Binding to these is refused. */
const FORBIDDEN_HOSTS = new Set(['0.0.0.0', '::', '::0']);

export function loadEnv(source: NodeJS.ProcessEnv = process.env): DaemonEnv {
  const parsed = EnvSchema.parse(source);

  if (FORBIDDEN_HOSTS.has(parsed.RELAYD_HOST.trim())) {
    throw new Error(
      `RELAYD_HOST="${parsed.RELAYD_HOST}" would expose the daemon publicly. ` +
        'Bind to 127.0.0.1 or the Tailscale interface only.',
    );
  }

  return {
    host: parsed.RELAYD_HOST,
    port: parsed.RELAYD_PORT,
    projectsDir: parsed.RELAYD_PROJECTS_DIR,
    dbPath: parsed.RELAYD_DB_PATH,
    workspacesDir: parsed.RELAYD_WORKSPACES_DIR,
    allowedRoots: (parsed.RELAYD_ALLOWED_ROOTS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    advertiseUrl: parsed.RELAYD_ADVERTISE_URL ?? `http://${parsed.RELAYD_HOST}:${parsed.RELAYD_PORT}`,
    sandboxEnabled: parsed.RELAYD_SANDBOX === 'on',
    approvalTimeoutMs: parsed.RELAYD_APPROVAL_TIMEOUT_MINUTES * 60_000,
    caffeinate: parsed.RELAYD_CAFFEINATE === 'on',
    downloadSecret: parsed.RELAYD_DOWNLOAD_SECRET ?? randomBytes(32).toString('hex'),
  };
}
