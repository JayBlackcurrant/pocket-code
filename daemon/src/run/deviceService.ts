import { spawn } from 'node:child_process';
import net from 'node:net';
import type { ProjectRegistry } from '../registry/projectRegistry.js';

/**
 * Device discovery (S5-06): the TypeScript port of scripts/adb-connect.sh — connect to the phone's
 * adb over the tailnet with a cascade (fixed :5555 → parallel port scan → `adb connect`), confirm
 * Flutter sees it, and report link quality. The shell-out is behind an injectable `DeviceRunner`
 * so the cascade is unit-testable with a fake. See LIVE_RUN_PLAN.md §3.3.
 */

export class DeviceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceError';
  }
}

/** Injectable boundary for shelling out (adb/flutter/tailscale) and TCP probing. */
export interface DeviceRunner {
  run(cmd: string, args: string[], opts?: { cwd?: string; timeoutMs?: number }): Promise<{ code: number; stdout: string; stderr: string }>;
  /** True if a TCP connection to host:port opens within timeoutMs. */
  probe(host: string, port: number, timeoutMs: number): Promise<boolean>;
}

export type LinkQuality = 'direct' | 'relay' | 'unknown';

export interface DiscoveredDevice {
  serial: string; // adb serial, host:port
  name: string | null; // flutter device name, when visible
  flutterVisible: boolean;
}

export interface DiscoverResult {
  host: string;
  port: number | null;
  connected: boolean;
  /** True when nothing answered — the phone likely needs re-arming (ColorOS won't auto-start adb). */
  reArmNeeded: boolean;
  quality: LinkQuality;
  devices: DiscoveredDevice[];
}

// --- pure parsers (exported for tests) --------------------------------------

/** Parse `adb devices` output into {serial, state} rows (skips the header). */
export function parseAdbDevices(stdout: string): Array<{ serial: string; state: string }> {
  return stdout
    .split('\n')
    .slice(1) // drop "List of devices attached"
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => {
      const [serial, state] = l.split(/\s+/);
      return { serial: serial ?? '', state: state ?? '' };
    })
    .filter((d) => d.serial.length > 0);
}

/** Parse `flutter devices --machine` JSON into {id, name} rows. Tolerant of noise/garbage. */
export function parseFlutterDevices(stdout: string): Array<{ id: string; name: string }> {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: Array<{ id: string; name: string }> = [];
  for (const el of parsed) {
    if (el && typeof el === 'object') {
      const o = el as Record<string, unknown>;
      if (typeof o.id === 'string') out.push({ id: o.id, name: typeof o.name === 'string' ? o.name : '' });
    }
  }
  return out;
}

/** Derive link quality for a host from `tailscale status` output. */
export function parseLinkQuality(status: string, host: string): LinkQuality {
  const line = status.split('\n').find((l) => l.includes(host));
  if (!line) return 'unknown';
  if (/\bdirect\b/i.test(line)) return 'direct';
  if (/\brelay\b/i.test(line)) return 'relay';
  return 'unknown';
}

// --- real runner ------------------------------------------------------------

export const realDeviceRunner: DeviceRunner = {
  run(cmd, args, opts = {}) {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      const child = spawn(cmd, args, opts.cwd !== undefined ? { cwd: opts.cwd } : {});
      const timer = opts.timeoutMs ? setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs) : null;
      child.stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
      child.stderr?.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
      child.on('error', (e: Error) => {
        if (timer) clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: stderr || e.message });
      });
      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        resolve({ code: code ?? -1, stdout, stderr });
      });
    });
  },
  probe(host, port, timeoutMs) {
    return new Promise((resolve) => {
      const socket = net.connect({ host, port });
      const done = (v: boolean): void => {
        socket.destroy();
        resolve(v);
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
    });
  },
};

/** Minimal structured logger. */
export interface DeviceLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}
const noopLogger: DeviceLogger = { info: () => {}, warn: () => {} };

export interface DeviceServiceDeps {
  registry: ProjectRegistry;
  runner?: DeviceRunner;
  logger?: DeviceLogger;
  /** Fixed port tried first (the `adb tcpip 5555` convention). */
  fixedPort?: number;
  /** Inclusive scan range when the fixed port misses. */
  scanRange?: [number, number];
  scanParallelism?: number;
  probeTimeoutMs?: number;
  adbTimeoutMs?: number;
  flutterTimeoutMs?: number;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const idx = next++;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export class DeviceService {
  private readonly registry: ProjectRegistry;
  private readonly runner: DeviceRunner;
  private log: DeviceLogger;
  private readonly fixedPort: number;
  private readonly scanRange: [number, number];
  private readonly scanParallelism: number;
  private readonly probeTimeoutMs: number;
  private readonly adbTimeoutMs: number;
  private readonly flutterTimeoutMs: number;

  constructor(deps: DeviceServiceDeps) {
    this.registry = deps.registry;
    this.runner = deps.runner ?? realDeviceRunner;
    this.log = deps.logger ?? noopLogger;
    this.fixedPort = deps.fixedPort ?? 5555;
    this.scanRange = deps.scanRange ?? [30000, 44000];
    this.scanParallelism = deps.scanParallelism ?? 128;
    this.probeTimeoutMs = deps.probeTimeoutMs ?? 1000;
    this.adbTimeoutMs = deps.adbTimeoutMs ?? 10000;
    this.flutterTimeoutMs = deps.flutterTimeoutMs ?? 20000;
  }

  setLogger(logger: DeviceLogger): void {
    this.log = logger;
  }

  /** Run the connect cascade for a project's phone host and report the result. */
  async discover(input: { projectId: string; host: string }): Promise<DiscoverResult> {
    const project = this.registry.getActive(input.projectId);
    if (!project?.resolvedPath) throw new DeviceError(`project not active: "${input.projectId}"`);
    const { host } = input;
    const cwd = project.resolvedPath;
    const flutter = project.manifest.flutter === 'system' ? ['flutter'] : ['fvm', 'flutter'];

    // Cascade: fixed :5555 first, then a parallel scan.
    let port = await this.tryConnect(host, this.fixedPort);
    if (port === null) port = await this.scan(host);

    const quality = await this.linkQuality(host);

    if (port === null) {
      this.log.warn({ host }, 'no adb port reachable; phone needs re-arm');
      return { host, port: null, connected: false, reArmNeeded: true, quality, devices: [] };
    }

    const serial = `${host}:${port}`;
    const flutterDevs = await this.flutterDevices(cwd, flutter);
    const match = flutterDevs.find((d) => d.id === serial);
    this.log.info({ host, port, flutterVisible: Boolean(match), quality }, 'device discovered');
    return {
      host,
      port,
      connected: true,
      reArmNeeded: false,
      quality,
      devices: [{ serial, name: match?.name ?? null, flutterVisible: Boolean(match) }],
    };
  }

  /** `adb connect host:port`, confirmed via `adb devices`. Returns the port on success, else null. */
  private async tryConnect(host: string, port: number): Promise<number | null> {
    const { stdout } = await this.runner.run('adb', ['connect', `${host}:${port}`], { timeoutMs: this.adbTimeoutMs });
    if (!/connected|already/i.test(stdout)) return null;
    const list = await this.runner.run('adb', ['devices'], { timeoutMs: this.adbTimeoutMs });
    const serial = `${host}:${port}`;
    return parseAdbDevices(list.stdout).some((d) => d.serial === serial && d.state === 'device') ? port : null;
  }

  /** Parallel-scan the range for an open port, then adb-connect the first that answers. */
  private async scan(host: string): Promise<number | null> {
    const [low, high] = this.scanRange;
    const ports: number[] = [];
    for (let p = low; p <= high; p++) ports.push(p);
    const open = await mapLimit(ports, this.scanParallelism, (p) => this.runner.probe(host, p, this.probeTimeoutMs));
    for (let i = 0; i < ports.length; i++) {
      if (open[i]) {
        const connected = await this.tryConnect(host, ports[i]!);
        if (connected !== null) return connected;
      }
    }
    return null;
  }

  private async flutterDevices(cwd: string, flutter: string[]): Promise<Array<{ id: string; name: string }>> {
    const [cmd, ...rest] = flutter;
    const res = await this.runner.run(cmd!, [...rest, 'devices', '--machine'], { cwd, timeoutMs: this.flutterTimeoutMs });
    if (res.code !== 0) return [];
    return parseFlutterDevices(res.stdout);
  }

  private async linkQuality(host: string): Promise<LinkQuality> {
    try {
      const res = await this.runner.run('tailscale', ['status'], { timeoutMs: this.adbTimeoutMs });
      return parseLinkQuality(res.stdout, host);
    } catch {
      return 'unknown';
    }
  }
}
