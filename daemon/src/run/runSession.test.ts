import { describe, expect, it } from 'vitest';
import {
  parseFlutterMachineLine,
  createRunSessionEngine,
  makeSpawnRunSession,
  type RunSessionEvent,
} from './runSession.js';

describe('parseFlutterMachineLine', () => {
  it('treats a non-JSON line as a log', () => {
    expect(parseFlutterMachineLine('Launching lib/main.dart on Pixel in debug mode...')).toEqual([
      { kind: 'log', line: 'Launching lib/main.dart on Pixel in debug mode...' },
    ]);
  });

  it('returns nothing for a blank line', () => {
    expect(parseFlutterMachineLine('   ')).toEqual([]);
  });

  it('parses app.start (starting) and app.started (started)', () => {
    expect(parseFlutterMachineLine('[{"event":"app.start","params":{"appId":"a1"}}]')).toEqual([
      { kind: 'starting', appId: 'a1' },
    ]);
    expect(parseFlutterMachineLine('[{"event":"app.started","params":{"appId":"a1"}}]')).toEqual([
      { kind: 'started', appId: 'a1' },
    ]);
  });

  it('parses debugPort, progress, app.log and app.stop', () => {
    expect(
      parseFlutterMachineLine('[{"event":"app.debugPort","params":{"wsUri":"ws://x/ws","baseUri":"http://x"}}]'),
    ).toEqual([{ kind: 'debugPort', wsUri: 'ws://x/ws', baseUri: 'http://x' }]);
    expect(parseFlutterMachineLine('[{"event":"app.progress","params":{"message":"Building","finished":false}}]')).toEqual([
      { kind: 'progress', message: 'Building', finished: false },
    ]);
    expect(parseFlutterMachineLine('[{"event":"app.log","params":{"log":"hi","error":true}}]')).toEqual([
      { kind: 'appLog', log: 'hi', error: true },
    ]);
    expect(parseFlutterMachineLine('[{"event":"app.stop","params":{"appId":"a1"}}]')).toEqual([{ kind: 'stopped' }]);
  });

  it('parses success and error responses', () => {
    expect(parseFlutterMachineLine('[{"id":1,"result":{"code":0,"message":"done"}}]')).toEqual([
      { kind: 'response', id: 1, ok: true, code: 0, message: 'done' },
    ]);
    expect(parseFlutterMachineLine('[{"id":3,"result":{"code":1,"message":"reload failed"}}]')).toEqual([
      { kind: 'response', id: 3, ok: false, code: 1, message: 'reload failed' },
    ]);
    expect(parseFlutterMachineLine('[{"id":2,"error":{"code":-32602,"message":"bad"}}]')).toEqual([
      { kind: 'response', id: 2, ok: false, code: -32602, message: 'bad' },
    ]);
    // app.stop returns a bare `true`
    expect(parseFlutterMachineLine('[{"id":4,"result":true}]')).toEqual([
      { kind: 'response', id: 4, ok: true, code: null, message: null },
    ]);
  });

  it('ignores unknown events and malformed JSON (falls back to log for the latter)', () => {
    expect(parseFlutterMachineLine('[{"event":"daemon.logMessage","params":{}}]')).toEqual([]);
    expect(parseFlutterMachineLine('[not json')).toEqual([{ kind: 'log', line: '[not json' }]);
  });
});

describe('createRunSessionEngine', () => {
  function harness() {
    const events: RunSessionEvent[] = [];
    const writes: string[] = [];
    const engine = createRunSessionEngine({ write: (d) => writes.push(d), onEvent: (e) => events.push(e) });
    return { engine, events, writes };
  }

  it('tracks appId from app.start and forwards events', () => {
    const { engine, events } = harness();
    engine.feed('stdout', '[{"event":"app.start","params":{"appId":"a1"}}]\n');
    expect(engine.appId).toBe('a1');
    engine.feed('stdout', '[{"event":"app.started","params":{"appId":"a1"}}]\n');
    expect(events).toEqual([
      { kind: 'starting', appId: 'a1' },
      { kind: 'started', appId: 'a1' },
    ]);
  });

  it('splits buffered chunks on newlines, including a partial then its completion', () => {
    const { engine, events } = harness();
    engine.feed('stdout', '[{"event":"app.log","params":{"log":"one"}}]\n[{"event":"app.log","param');
    engine.feed('stdout', 's":{"log":"two"}}]\n');
    expect(events).toEqual([
      { kind: 'appLog', log: 'one', error: false },
      { kind: 'appLog', log: 'two', error: false },
    ]);
  });

  it('emits stderr lines as logs', () => {
    const { engine, events } = harness();
    engine.feed('stderr', 'E/flutter: boom\n');
    expect(events).toEqual([{ kind: 'log', stream: 'stderr', line: 'E/flutter: boom' }]);
  });

  it('reload writes a control command and resolves when the matching response arrives', async () => {
    const { engine, writes } = harness();
    engine.feed('stdout', '[{"event":"app.started","params":{"appId":"a1"}}]\n');
    const p = engine.reload();
    expect(writes).toHaveLength(1);
    const sent = JSON.parse(writes[0]!) as Array<{ id: number; method: string; params: Record<string, unknown> }>;
    expect(sent[0]!.method).toBe('app.restart');
    expect(sent[0]!.params).toMatchObject({ appId: 'a1', fullRestart: false });
    engine.feed('stdout', `[{"id":${sent[0]!.id},"result":{"code":0,"message":"ok"}}]\n`);
    await expect(p).resolves.toEqual({ ok: true, code: 0, message: 'ok' });
  });

  it('restart sends fullRestart:true', async () => {
    const { engine, writes } = harness();
    engine.feed('stdout', '[{"event":"app.started","params":{"appId":"a1"}}]\n');
    void engine.restart();
    const sent = JSON.parse(writes[0]!) as Array<{ params: Record<string, unknown> }>;
    expect(sent[0]!.params).toMatchObject({ fullRestart: true });
  });

  it('refuses reload before the app has started (no write)', async () => {
    const { engine, writes } = harness();
    await expect(engine.reload()).resolves.toEqual({ ok: false, code: null, message: 'app not started yet' });
    expect(writes).toHaveLength(0);
  });

  it('flush emits a trailing partial line', () => {
    const { engine, events } = harness();
    engine.feed('stdout', 'half a line with no newline');
    expect(events).toEqual([]);
    engine.flush();
    expect(events).toEqual([{ kind: 'log', stream: 'stdout', line: 'half a line with no newline' }]);
  });

  it('failAllPending settles in-flight controls as failed', async () => {
    const { engine } = harness();
    engine.feed('stdout', '[{"event":"app.started","params":{"appId":"a1"}}]\n');
    const p = engine.reload();
    engine.failAllPending('process exited');
    await expect(p).resolves.toEqual({ ok: false, code: null, message: 'process exited' });
  });
});

describe('makeSpawnRunSession (real spawn)', () => {
  // A tiny Node program stands in for `flutter run --machine`: it emits the daemon handshake,
  // then answers app.restart / app.stop it reads on stdin. Exercises spawn + stdin + parsing.
  const FAKE = [
    "const out=(o)=>process.stdout.write(JSON.stringify(o)+'\\n');",
    "out([{event:'daemon.connected',params:{version:'1'}}]);",
    "out([{event:'app.start',params:{appId:'a1'}}]);",
    "out([{event:'app.started',params:{appId:'a1'}}]);",
    "process.stdin.on('data',(d)=>{const s=d.toString();",
    "if(s.includes('app.restart'))out([{id:1,result:{code:0,message:'reloaded'}}]);",
    "if(s.includes('app.stop')){out([{id:2,result:true}]);process.exit(0);}});",
  ].join('');

  it('spawns, streams events, hot-reloads via stdin, and stops', async () => {
    const events: RunSessionEvent[] = [];
    let resolveStarted!: (id: string) => void;
    const startedAppId = new Promise<string>((r) => {
      resolveStarted = r;
    });
    const onEvent = (e: RunSessionEvent): void => {
      events.push(e);
      if (e.kind === 'started') resolveStarted(e.appId);
    };
    const spawnRun = makeSpawnRunSession({ caffeinate: false });
    const handle = spawnRun({
      command: 'node',
      argv: { cmd: process.execPath, args: ['-e', FAKE] },
      cwd: process.cwd(),
      signal: new AbortController().signal,
      onEvent,
    });

    const appId = await startedAppId;
    expect(appId).toBe('a1');
    expect(handle.appId).toBe('a1');

    await expect(handle.reload()).resolves.toEqual({ ok: true, code: 0, message: 'reloaded' });
    await expect(handle.stop()).resolves.toMatchObject({ ok: true });
    await expect(handle.exited).resolves.toEqual({ code: 0 });
    expect(events.some((e) => e.kind === 'daemonConnected')).toBe(true);
  });
});
