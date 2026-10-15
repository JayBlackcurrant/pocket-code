import { describe, expect, it } from 'vitest';
import { ProjectManifestSchema, type ProjectManifest } from '../config/projectManifest.js';
import type { ProjectRegistry } from '../registry/projectRegistry.js';
import {
  DeviceService,
  DeviceError,
  parseAdbDevices,
  parseFlutterDevices,
  parseLinkQuality,
  type DeviceRunner,
} from './deviceService.js';

const manifest: ProjectManifest = ProjectManifestSchema.parse({
  id: 'hedged',
  path: '/p',
  flutter: 'fvm',
  build: { apk: 'fvm flutter build apk' },
  signing: { mode: 'in-repo' },
  git: { remote: 'origin', base: 'main' },
});

function registry(active = true): ProjectRegistry {
  return {
    getActive: (id: string) => (active && id === 'hedged' ? { manifest, resolvedPath: '/p', status: 'active' } : undefined),
  } as unknown as ProjectRegistry;
}

interface Scenario {
  connectablePorts?: number[]; // ports where `adb connect` succeeds AND the device shows up
  openPorts?: number[]; // ports the TCP probe reports open
  flutterDevices?: string; // `flutter devices --machine` stdout
  tailscale?: string;
  adbMissing?: boolean;
}

function fakeRunner(s: Scenario): DeviceRunner {
  return {
    async run(cmd, args) {
      if (s.adbMissing && cmd === 'adb') return { code: -1, stdout: '', stderr: 'adb: not found' };
      if (cmd === 'adb' && args[0] === 'connect') {
        const target = args[1] ?? '';
        const ok = (s.connectablePorts ?? []).some((p) => target.endsWith(`:${p}`));
        return { code: ok ? 0 : 1, stdout: ok ? `connected to ${target}` : `failed to connect to ${target}`, stderr: '' };
      }
      if (cmd === 'adb' && args[0] === 'devices') {
        const lines = (s.connectablePorts ?? []).map((p) => `100.1.1.1:${p}\tdevice`);
        return { code: 0, stdout: ['List of devices attached', ...lines].join('\n'), stderr: '' };
      }
      if (args.includes('devices') && args.includes('--machine')) {
        return { code: 0, stdout: s.flutterDevices ?? '[]', stderr: '' };
      }
      if (cmd === 'tailscale') return { code: 0, stdout: s.tailscale ?? '', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    },
    async probe(_host, port) {
      return (s.openPorts ?? []).includes(port);
    },
  };
}

const HOST = '100.1.1.1';

describe('DeviceService.discover cascade', () => {
  it('connects on the fixed port 5555 and reports flutter visibility + quality', async () => {
    const svc = new DeviceService({
      registry: registry(),
      runner: fakeRunner({
        connectablePorts: [5555],
        flutterDevices: '[{"id":"100.1.1.1:5555","name":"realme 11 Pro"}]',
        tailscale: '100.1.1.1   realme   user@   android   active; direct 1.2.3.4:41641',
      }),
    });
    const res = await svc.discover({ projectId: 'hedged', host: HOST });
    expect(res).toMatchObject({ connected: true, reArmNeeded: false, port: 5555, quality: 'direct' });
    expect(res.devices).toEqual([{ serial: '100.1.1.1:5555', name: 'realme 11 Pro', flutterVisible: true }]);
  });

  it('falls back to a parallel scan when 5555 misses', async () => {
    const svc = new DeviceService({
      registry: registry(),
      scanRange: [40000, 40005],
      runner: fakeRunner({
        connectablePorts: [40002],
        openPorts: [40002],
        tailscale: '100.1.1.1   realme   active; relay "blr"',
      }),
    });
    const res = await svc.discover({ projectId: 'hedged', host: HOST });
    expect(res).toMatchObject({ connected: true, port: 40002, quality: 'relay' });
    expect(res.devices[0]?.flutterVisible).toBe(false); // flutter sees nothing in this scenario
  });

  it('reports reArmNeeded when nothing answers', async () => {
    const svc = new DeviceService({
      registry: registry(),
      scanRange: [40000, 40005],
      runner: fakeRunner({ connectablePorts: [], openPorts: [] }),
    });
    const res = await svc.discover({ projectId: 'hedged', host: HOST });
    expect(res).toMatchObject({ connected: false, reArmNeeded: true, port: null, devices: [] });
  });

  it('treats a missing adb as unreachable (reArmNeeded)', async () => {
    const svc = new DeviceService({
      registry: registry(),
      scanRange: [40000, 40002],
      runner: fakeRunner({ adbMissing: true, openPorts: [40001] }),
    });
    const res = await svc.discover({ projectId: 'hedged', host: HOST });
    expect(res.reArmNeeded).toBe(true);
  });

  it('throws DeviceError for an inactive project', async () => {
    const svc = new DeviceService({ registry: registry(false), runner: fakeRunner({}) });
    await expect(svc.discover({ projectId: 'hedged', host: HOST })).rejects.toBeInstanceOf(DeviceError);
  });
});

describe('device output parsers', () => {
  it('parseAdbDevices skips the header and splits serial/state', () => {
    const out = 'List of devices attached\n100.1.1.1:5555\tdevice\nemulator-5554\toffline\n';
    expect(parseAdbDevices(out)).toEqual([
      { serial: '100.1.1.1:5555', state: 'device' },
      { serial: 'emulator-5554', state: 'offline' },
    ]);
  });

  it('parseFlutterDevices reads id/name from the JSON array amid noise', () => {
    const out = 'Some banner\n[{"id":"100.1.1.1:5555","name":"realme"},{"id":"chrome"}]\n';
    expect(parseFlutterDevices(out)).toEqual([
      { id: '100.1.1.1:5555', name: 'realme' },
      { id: 'chrome', name: '' },
    ]);
    expect(parseFlutterDevices('no json here')).toEqual([]);
  });

  it('parseLinkQuality finds direct/relay/unknown for the host line', () => {
    expect(parseLinkQuality('100.1.1.1 phone active; direct 1.2.3.4', '100.1.1.1')).toBe('direct');
    expect(parseLinkQuality('100.1.1.1 phone active; relay "blr"', '100.1.1.1')).toBe('relay');
    expect(parseLinkQuality('100.9.9.9 other active; direct', '100.1.1.1')).toBe('unknown');
    expect(parseLinkQuality('100.1.1.1 phone active; idle', '100.1.1.1')).toBe('unknown');
  });
});
