/**
 * Dart VM Service client for the live-run debug console (S5-14).
 *
 * `flutter run --machine` already forwards the app's stdout (as `app.log` → `run.log`). The VM
 * Service adds what a real debug console shows and stdout does not: the **Logging** stream
 * (`dart:developer.log` records with levels + logger names) and structured **Flutter.Error**
 * events. We connect to the VM Service WebSocket (its URI arrives via `app.debugPort`), speak
 * JSON-RPC, subscribe to those streams, and surface normalized `ConsoleEntry`s.
 *
 * The socket is injectable so the client + parser are unit-testable without a real VM.
 */

export interface ConsoleEntry {
  source: 'log' | 'error' | 'stdout' | 'stderr';
  level: string | null; // FINE | INFO | WARNING | SEVERE (Logging), SEVERE (errors), null otherwise
  text: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

/** A VM Service value is often an `@Instance` ref carrying `valueAsString`; accept either. */
function strVal(v: unknown): string | null {
  if (typeof v === 'string') return v;
  const r = asRecord(v);
  if (r && typeof r.valueAsString === 'string') return r.valueAsString;
  return null;
}

function levelName(n: number): string {
  if (n >= 1000) return 'SEVERE';
  if (n >= 900) return 'WARNING';
  if (n >= 800) return 'INFO';
  if (n >= 500) return 'FINE';
  return '';
}

/** Parse one VM Service stream event into a console entry, or null if it carries nothing useful. */
export function parseVmEvent(streamId: string, event: unknown): ConsoleEntry | null {
  const e = asRecord(event);
  if (!e) return null;
  const kind = e.kind;

  if (kind === 'Logging') {
    const rec = asRecord(e.logRecord);
    if (!rec) return null;
    const message = strVal(rec.message);
    if (!message) return null;
    const name = strVal(rec.loggerName);
    const err = strVal(rec.error);
    const level = levelName(typeof rec.level === 'number' ? rec.level : 0);
    const text = (name ? `[${name}] ` : '') + message + (err ? `\n${err}` : '');
    return { source: 'log', level: level || null, text };
  }

  if (kind === 'Extension' && e.extensionKind === 'Flutter.Error') {
    const data = asRecord(e.extensionData);
    const desc = data && typeof data.description === 'string' ? data.description : 'Flutter error';
    return { source: 'error', level: 'SEVERE', text: desc };
  }

  if (kind === 'WriteEvent') {
    // Only reached if a caller also subscribes Stdout/Stderr (we don't by default, to avoid
    // duplicating flutter run's app.log). Decode the base64 payload if present.
    const bytes = typeof e.bytes === 'string' ? Buffer.from(e.bytes, 'base64').toString('utf8') : '';
    if (!bytes) return null;
    return { source: streamId === 'Stderr' ? 'stderr' : 'stdout', level: null, text: bytes.replace(/\n$/, '') };
  }

  return null;
}

/** Minimal socket surface the client needs; injectable so tests pass a fake. */
export interface VmSocket {
  send(data: string): void;
  close(): void;
  onMessage(cb: (data: string) => void): void;
  onOpen(cb: () => void): void;
  onClose(cb: () => void): void;
}

export type VmSocketFactory = (url: string) => VmSocket;

/** Real factory over Node's global WebSocket (undici; Node 22+). */
export const defaultVmSocketFactory: VmSocketFactory = (url) => {
  // eslint-disable-next-line no-undef -- global WebSocket is provided by the Node runtime.
  const ws = new WebSocket(url);
  return {
    send: (d) => ws.send(d),
    close: () => ws.close(),
    onMessage: (cb) =>
      ws.addEventListener('message', (ev: { data: unknown }) =>
        cb(typeof ev.data === 'string' ? ev.data : String(ev.data)),
      ),
    onOpen: (cb) => ws.addEventListener('open', () => cb()),
    onClose: (cb) => {
      ws.addEventListener('close', () => cb());
      ws.addEventListener('error', () => cb());
    },
  };
};

export interface VmServiceClient {
  close(): void;
}

/**
 * Connect to a VM Service WebSocket and stream its Logging + Flutter.Error events as ConsoleEntrys.
 * Best-effort: a parse/connect hiccup never throws into the caller. Returns a handle to close it.
 */
export function createVmServiceClient(opts: {
  url: string;
  onEntry: (e: ConsoleEntry) => void;
  factory?: VmSocketFactory;
  streams?: string[];
  onClosed?: () => void;
}): VmServiceClient {
  const factory = opts.factory ?? defaultVmSocketFactory;
  const streams = opts.streams ?? ['Logging', 'Extension'];
  let closed = false;
  const sock = factory(opts.url);

  sock.onOpen(() => {
    streams.forEach((streamId, i) =>
      sock.send(JSON.stringify({ jsonrpc: '2.0', id: i + 1, method: 'streamListen', params: { streamId } })),
    );
  });

  sock.onMessage((data) => {
    let msg: unknown;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    const m = asRecord(msg);
    if (!m || m.method !== 'streamNotify') return; // ignore streamListen responses
    const p = asRecord(m.params);
    if (!p) return;
    const entry = parseVmEvent(typeof p.streamId === 'string' ? p.streamId : '', p.event);
    if (entry) opts.onEntry(entry);
  });

  sock.onClose(() => {
    if (!closed) {
      closed = true;
      opts.onClosed?.();
    }
  });

  return {
    close: () => {
      closed = true;
      try {
        sock.close();
      } catch {
        /* already closed */
      }
    },
  };
}
