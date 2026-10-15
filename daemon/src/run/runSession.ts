import { spawn } from 'node:child_process';
import { caffeinateWrap, tokenizeCommand } from '../build/buildService.js';

/**
 * Live-run session spawn layer (S5-02). Spawns `flutter run --machine`, keeps the child alive
 * for the whole session, writes control commands to its stdin (hot reload / restart / stop),
 * and parses the Flutter daemon JSON protocol on stdout into structured events.
 *
 * Split into a pure state engine (`createRunSessionEngine`, fully unit-testable by feeding it
 * bytes) and a thin spawn wrapper (`makeSpawnRunSession`), mirroring BuildService's RunStep.
 * See LIVE_RUN_PLAN.md §4.2.
 */

/** Per-line cap so a runaway log line can't bloat a DB row / the phone. */
const MAX_LINE_LEN = 4000;

/** Structured events the session surfaces to RunService (S5-03). `log` carries plain lines
 *  (app output / non-protocol stdout / stderr); the rest map Flutter daemon notifications. */
export type RunSessionEvent =
  | { kind: 'log'; stream: 'stdout' | 'stderr'; line: string }
  | { kind: 'daemonConnected' }
  | { kind: 'starting'; appId: string } // app.start — launching
  | { kind: 'started'; appId: string } // app.started — running/ready
  | { kind: 'debugPort'; wsUri: string | null; baseUri: string | null }
  | { kind: 'progress'; message: string; finished: boolean }
  | { kind: 'appLog'; log: string; error: boolean }
  | { kind: 'stopped' };

/** Result of a hot reload / restart / stop control command. */
export interface RunControlResult {
  ok: boolean;
  code: number | null;
  message: string | null;
}

/** One parsed Flutter-daemon message. Internal; `response` is consumed by the engine, the
 *  rest become RunSessionEvents. */
export type ParsedMessage =
  | { kind: 'log'; line: string }
  | { kind: 'daemonConnected' }
  | { kind: 'starting'; appId: string }
  | { kind: 'started'; appId: string }
  | { kind: 'debugPort'; wsUri: string | null; baseUri: string | null }
  | { kind: 'progress'; message: string; finished: boolean }
  | { kind: 'appLog'; log: string; error: boolean }
  | { kind: 'stopped' }
  | { kind: 'response'; id: number; ok: boolean; code: number | null; message: string | null };

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Parse one Flutter daemon response element (`{id, result|error}`). */
function parseResponse(o: Record<string, unknown>, id: number): ParsedMessage {
  const err = asRecord(o.error);
  if (err) {
    return { kind: 'response', id, ok: false, code: typeof err.code === 'number' ? err.code : null, message: strOrNull(err.message) ?? 'error' };
  }
  const result = o.result;
  const resObj = asRecord(result);
  if (resObj && typeof resObj.code === 'number') {
    return { kind: 'response', id, ok: resObj.code === 0, code: resObj.code, message: strOrNull(resObj.message) };
  }
  // app.stop returns `true`; other results with no code are treated as success.
  return { kind: 'response', id, ok: result !== false, code: null, message: null };
}

/** Parse one Flutter daemon event element (`{event, params}`). Unknown events → null. */
function parseEvent(o: Record<string, unknown>): ParsedMessage | null {
  const event = o.event;
  if (typeof event !== 'string') return null;
  const params = asRecord(o.params) ?? {};
  switch (event) {
    case 'daemon.connected':
      return { kind: 'daemonConnected' };
    case 'app.start': {
      const appId = strOrNull(params.appId);
      return appId ? { kind: 'starting', appId } : null;
    }
    case 'app.started': {
      const appId = strOrNull(params.appId);
      return appId ? { kind: 'started', appId } : null;
    }
    case 'app.debugPort':
      return { kind: 'debugPort', wsUri: strOrNull(params.wsUri), baseUri: strOrNull(params.baseUri) };
    case 'app.progress':
      return { kind: 'progress', message: strOrNull(params.message) ?? '', finished: params.finished === true };
    case 'app.log':
      return { kind: 'appLog', log: strOrNull(params.log) ?? '', error: params.error === true };
    case 'app.stop':
      return { kind: 'stopped' };
    default:
      return null;
  }
}

/**
 * Parse one line of `flutter run --machine` stdout. Protocol lines are a JSON array of one or
 * more message objects; anything else (human text, compiler output, app prints) becomes a log.
 */
export function parseFlutterMachineLine(line: string): ParsedMessage[] {
  const trimmed = line.trim();
  if (trimmed === '') return [];
  if (!trimmed.startsWith('[')) return [{ kind: 'log', line }];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [{ kind: 'log', line }];
  }
  if (!Array.isArray(parsed)) return [{ kind: 'log', line }];
  const out: ParsedMessage[] = [];
  for (const el of parsed) {
    const o = asRecord(el);
    if (!o) continue;
    if (typeof o.id === 'number') {
      out.push(parseResponse(o, o.id));
    } else {
      const ev = parseEvent(o);
      if (ev) out.push(ev);
    }
  }
  return out;
}

const cap = (s: string): string => (s.length > MAX_LINE_LEN ? s.slice(0, MAX_LINE_LEN) : s);

export interface RunSessionEngine {
  /** Feed a raw stdout/stderr chunk; splits into lines, parses, emits events, resolves controls. */
  feed(stream: 'stdout' | 'stderr', chunk: string): void;
  /** Emit any trailing partial buffers as final lines (call on process close). */
  flush(): void;
  reload(): Promise<RunControlResult>;
  restart(): Promise<RunControlResult>;
  stop(): Promise<RunControlResult>;
  /** Resolve every in-flight control as failed (call when the process exits). */
  failAllPending(reason: string): void;
  readonly appId: string | null;
}

/**
 * The pure session state machine: line buffering, protocol parsing, appId tracking, and
 * request/response correlation for hot reload/restart/stop. `write` sends a line to the child's
 * stdin; `onEvent` receives structured events. No process here, so tests drive it directly.
 */
export function createRunSessionEngine(deps: {
  write: (data: string) => void;
  onEvent: (e: RunSessionEvent) => void;
}): RunSessionEngine {
  const buffers: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };
  let appId: string | null = null;
  let nextId = 1;
  const pending = new Map<number, (r: RunControlResult) => void>();

  function handle(msg: ParsedMessage): void {
    switch (msg.kind) {
      case 'response': {
        const resolve = pending.get(msg.id);
        if (resolve) {
          pending.delete(msg.id);
          resolve({ ok: msg.ok, code: msg.code, message: msg.message });
        }
        return;
      }
      case 'starting':
      case 'started':
        if (!appId) appId = msg.appId;
        deps.onEvent(msg);
        return;
      case 'log':
        deps.onEvent({ kind: 'log', stream: 'stdout', line: cap(msg.line) });
        return;
      case 'appLog':
        deps.onEvent({ kind: 'appLog', log: cap(msg.log), error: msg.error });
        return;
      case 'progress':
        deps.onEvent({ kind: 'progress', message: cap(msg.message), finished: msg.finished });
        return;
      default:
        deps.onEvent(msg); // daemonConnected | debugPort | stopped
    }
  }

  function feed(stream: 'stdout' | 'stderr', chunk: string): void {
    buffers[stream] += chunk;
    let nl = buffers[stream].indexOf('\n');
    while (nl !== -1) {
      const line = buffers[stream].slice(0, nl).replace(/\r$/, '');
      buffers[stream] = buffers[stream].slice(nl + 1);
      if (stream === 'stdout') {
        for (const m of parseFlutterMachineLine(line)) handle(m);
      } else if (line.length > 0) {
        deps.onEvent({ kind: 'log', stream: 'stderr', line: cap(line) });
      }
      nl = buffers[stream].indexOf('\n');
    }
  }

  function flush(): void {
    for (const stream of ['stdout', 'stderr'] as const) {
      const rest = buffers[stream];
      buffers[stream] = '';
      if (rest.length === 0) continue;
      if (stream === 'stdout') {
        for (const m of parseFlutterMachineLine(rest)) handle(m);
      } else {
        deps.onEvent({ kind: 'log', stream: 'stderr', line: cap(rest) });
      }
    }
  }

  function send(method: string, params: Record<string, unknown>): Promise<RunControlResult> {
    if (!appId && method !== 'app.stop') {
      return Promise.resolve({ ok: false, code: null, message: 'app not started yet' });
    }
    const id = nextId++;
    const body = JSON.stringify([{ id, method, params: { appId, ...params } }]) + '\n';
    return new Promise<RunControlResult>((resolve) => {
      pending.set(id, resolve);
      try {
        deps.write(body);
      } catch (e) {
        pending.delete(id);
        resolve({ ok: false, code: null, message: e instanceof Error ? e.message : 'write failed' });
      }
    });
  }

  return {
    feed,
    flush,
    reload: () => send('app.restart', { fullRestart: false, pause: false, reason: 'manual' }),
    restart: () => send('app.restart', { fullRestart: true, pause: false, reason: 'manual' }),
    stop: () => send('app.stop', {}),
    failAllPending(reason: string) {
      for (const resolve of pending.values()) resolve({ ok: false, code: null, message: reason });
      pending.clear();
    },
    get appId() {
      return appId;
    },
  };
}

/** A live handle onto a running `flutter run --machine` child. */
export interface RunSessionHandle {
  reload(): Promise<RunControlResult>;
  restart(): Promise<RunControlResult>;
  stop(): Promise<RunControlResult>;
  /** Force-kill the child (fallback when `stop()` doesn't settle). */
  kill(): void;
  readonly appId: string | null;
  /** Resolves when the child process exits. */
  readonly exited: Promise<{ code: number | null }>;
}

/** The single I/O boundary for a run session. Injectable so RunService tests never spawn a
 *  real `flutter`. */
export type SpawnRunSession = (args: {
  /** Full command string (e.g. "fvm flutter run --machine -d <serial>"), for logging/tokenizing. */
  command: string;
  /** Pre-tokenized argv; used verbatim when set (so an arg may contain spaces). */
  argv?: { cmd: string; args: string[] };
  cwd: string;
  signal: AbortSignal;
  onEvent: (e: RunSessionEvent) => void;
}) => RunSessionHandle;

/**
 * Real spawn-based run session: no shell, child retained with a piped stdin for control, and
 * (on macOS, unless disabled) wrapped in `caffeinate -i` so the Mac stays awake for the whole
 * session. `caffeinate` inherits stdio, so control writes still reach `flutter` (S3-08 pattern).
 */
export function makeSpawnRunSession(opts: { caffeinate?: boolean } = {}): SpawnRunSession {
  const caffeinate = opts.caffeinate ?? true;
  return ({ command, argv, cwd, signal, onEvent }) => {
    const base = argv ?? tokenizeCommand(command);
    const { cmd, args } = caffeinateWrap(base.cmd, base.args, { enabled: caffeinate });
    const child = spawn(cmd, args, { cwd, signal, stdio: ['pipe', 'pipe', 'pipe'] });
    const engine = createRunSessionEngine({
      write: (data) => {
        child.stdin?.write(data);
      },
      onEvent,
    });

    child.stdout?.on('data', (c: Buffer) => engine.feed('stdout', c.toString('utf8')));
    child.stderr?.on('data', (c: Buffer) => engine.feed('stderr', c.toString('utf8')));

    let resolveExit!: (v: { code: number | null }) => void;
    const exited = new Promise<{ code: number | null }>((r) => {
      resolveExit = r;
    });
    child.on('error', (err: Error) => {
      onEvent({ kind: 'log', stream: 'stderr', line: cap(`spawn error: ${err.message}`) });
      engine.flush();
      engine.failAllPending('process error');
      resolveExit({ code: null });
    });
    child.on('close', (code) => {
      engine.flush();
      engine.failAllPending('process exited');
      resolveExit({ code: code ?? null });
    });

    return {
      reload: () => engine.reload(),
      restart: () => engine.restart(),
      stop: () => engine.stop(),
      kill: () => {
        child.kill();
      },
      exited,
      get appId() {
        return engine.appId;
      },
    };
  };
}

/** Default run-session spawner (caffeinate on). Used when RunService is given none. */
export const spawnRunSession: SpawnRunSession = makeSpawnRunSession();
