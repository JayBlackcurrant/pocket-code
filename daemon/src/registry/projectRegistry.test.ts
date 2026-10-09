import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseProjectManifest } from '../config/projectManifest.js';
import { ProjectRegistry } from './projectRegistry.js';

let root: string;
let outside: string;

function manifest(id: string, path: string): ReturnType<typeof parseProjectManifest> {
  return parseProjectManifest(
    `
id: ${id}
path: "${path}"
flavorDefault: staging
allowedFlavors: [staging]
build:
  apk: "fvm flutter build apk --flavor {flavor} --release"
signing:
  mode: in-repo
git:
  remote: origin
  base: stag
`,
    `${id}.yaml`,
  );
}

beforeAll(() => {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'pc-registry-')));
  root = join(base, 'allowed');
  outside = join(base, 'outside');
  mkdirSync(join(root, 'hedged-core-app'), { recursive: true });
  mkdirSync(outside, { recursive: true });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('ProjectRegistry', () => {
  it('marks an in-allowlist project active with its canonical path', () => {
    const p = join(root, 'hedged-core-app');
    const reg = new ProjectRegistry([manifest('hedged', p)], [root], {});
    const project = reg.get('hedged');
    expect(project?.status).toBe('active');
    expect(project?.resolvedPath).toBe(p);
    expect(reg.getActive('hedged')).toBeDefined();
  });

  it('rejects a project whose path is outside the allowlist', () => {
    const reg = new ProjectRegistry([manifest('evil', outside)], [root], {});
    const project = reg.get('evil');
    expect(project?.status).toBe('rejected');
    expect(project?.reason).toMatch(/outside the allowlist/);
    expect(reg.getActive('evil')).toBeUndefined();
  });

  it('marks a project with an unexpanded placeholder unresolved', () => {
    const reg = new ProjectRegistry(
      [manifest('ph', '${AGENT_HOME}/workspaces/x')],
      [root],
      {}, // AGENT_HOME not set
    );
    expect(reg.get('ph')?.status).toBe('unresolved');
  });

  it('expands env placeholders then applies the allowlist', () => {
    const reg = new ProjectRegistry(
      [manifest('ph', '${AGENT_HOME}/hedged-core-app')],
      [root],
      { AGENT_HOME: root },
    );
    expect(reg.get('ph')?.status).toBe('active');
  });

  it('validateRegistrablePath rejects outside paths and accepts inside ones', () => {
    const reg = new ProjectRegistry([], [root], {});
    expect(() => reg.validateRegistrablePath(outside)).toThrow(/outside the allowlist/);
    const res = reg.validateRegistrablePath(join(root, 'hedged-core-app'));
    expect(res.canonicalPath).toBe(join(root, 'hedged-core-app'));
    expect(res.isGitRepo).toBe(false);
  });
});
