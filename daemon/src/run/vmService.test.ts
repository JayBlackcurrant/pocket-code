import { describe, expect, it } from 'vitest';
import {
  parseVmEvent,
  createVmServiceClient,
  type ConsoleEntry,
  type VmSocket,
} from './vmService.js';

describe('parseVmEvent', () => {
  it('parses a Logging record with logger name + level', () => {
    const entry = parseVmEvent('Logging', {
      kind: 'Logging',
      logRecord: {
        level: 900,
        loggerName: { valueAsString: 'auth' },
        message: { valueAsString: 'token refreshed' },
      },
    });
    expect(entry).toEqual({ source: 'log', level: 'WARNING', text: '[auth] token refreshed' });
  });

  it('appends a logged error to the message', () => {
    const entry = parseVmEvent('Logging', {
      kind: 'Logging',
      logRecord: { level: 1000, message: { valueAsString: 'boom' }, error: { valueAsString: 'StateError' } },
    });
    expect(entry?.source).toBe('log');
    expect(entry?.level).toBe('SEVERE');
    expect(entry?.text).toBe('boom\nStateError');
  });

  it('parses a Flutter.Error extension event', () => {
    const entry = parseVmEvent('Extension', {
      kind: 'Extension',
      extensionKind: 'Flutter.Error',
      extensionData: { description: 'A RenderFlex overflowed by 42 pixels' },
    });
    expect(entry).toEqual({ source: 'error', level: 'SEVERE', text: 'A RenderFlex overflowed by 42 pixels' });
  });

  it('decodes a WriteEvent (base64) when present', () => {
    const entry = parseVmEvent('Stderr', { kind: 'WriteEvent', bytes: Buffer.from('oops\n').toString('base64') });
    expect(entry).toEqual({ source: 'stderr', level: null, text: 'oops' });
  });

  it('ignores other extension kinds and empty records', () => {
    expect(parseVmEvent('Extension', { kind: 'Extension', extensionKind: 'Flutter.Frame' })).toBeNull();
    expect(parseVmEvent('Logging', { kind: 'Logging', logRecord: {} })).toBeNull();
    expect(parseVmEvent('Logging', 'nope')).toBeNull();
  });
});

/** A fake VM socket the test drives directly. */
function fakeSocket() {
  let onMessage: (d: string) => void = () => {};
  let onOpen: () => void = () => {};
  let onClose: () => void = () => {};
  const sent: string[] = [];
  let closed = false;
  const sock: VmSocket = {
    send: (d) => sent.push(d),
    close: () => {
      closed = true;
    },
    onMessage: (cb) => (onMessage = cb),
    onOpen: (cb) => (onOpen = cb),
    onClose: (cb) => (onClose = cb),
  };
  return {
    sock,
    sent,
    get closed() {
      return closed;
    },
    open: () => onOpen(),
    message: (d: string) => onMessage(d),
    fireClose: () => onClose(),
  };
}

describe('createVmServiceClient', () => {
  it('subscribes to Logging + Extension on open and surfaces entries', () => {
    const fake = fakeSocket();
    const entries: ConsoleEntry[] = [];
    createVmServiceClient({ url: 'ws://x/ws', onEntry: (e) => entries.push(e), factory: () => fake.sock });

    fake.open();
    const subs = fake.sent.map((s) => JSON.parse(s) as { method: string; params: { streamId: string } });
    expect(subs.every((s) => s.method === 'streamListen')).toBe(true);
    expect(subs.map((s) => s.params.streamId)).toEqual(['Logging', 'Extension']);

    fake.message(
      JSON.stringify({
        method: 'streamNotify',
        params: { streamId: 'Logging', event: { kind: 'Logging', logRecord: { level: 800, message: { valueAsString: 'hi' } } } },
      }),
    );
    expect(entries).toEqual([{ source: 'log', level: 'INFO', text: 'hi' }]);
  });

  it('ignores streamListen responses and malformed frames', () => {
    const fake = fakeSocket();
    const entries: ConsoleEntry[] = [];
    createVmServiceClient({ url: 'ws://x', onEntry: (e) => entries.push(e), factory: () => fake.sock });
    fake.open();
    fake.message(JSON.stringify({ id: 1, result: { type: 'Success' } })); // response, not a notify
    fake.message('not json');
    expect(entries).toHaveLength(0);
  });

  it('close() closes the socket', () => {
    const fake = fakeSocket();
    const client = createVmServiceClient({ url: 'ws://x', onEntry: () => {}, factory: () => fake.sock });
    client.close();
    expect(fake.closed).toBe(true);
  });
});
