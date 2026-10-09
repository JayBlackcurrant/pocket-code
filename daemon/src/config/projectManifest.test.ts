import { describe, expect, it } from 'vitest';
import { parseProjectManifest } from './projectManifest.js';
import {
  flavorBlockedReason,
  branchBlockedReason,
  GuardrailError,
  resolveBuildFlavor,
} from '../guardrails.js';

const HEDGED_STAGING = `
id: hedged
displayName: Hedged (staging)
path: /tmp/workspaces/hedged-core-app
flutter: fvm
flavorDefault: staging
allowedFlavors: [staging]
codegen:
  requiresSibling: ../hedged-core-backend
  steps:
    - "fvm flutter pub get"
build:
  apk: "fvm flutter build apk --flavor {flavor} --release"
signing:
  mode: in-repo
  flavor: staging
git:
  remote: origin
  base: stag
distribution:
  firebaseAppDistribution:
    firebaseProject: hedged-core-staging
    appId: APP_ID
    uploadCmd: "firebase appdistribution:distribute {apk} --app {appId}"
guardrails:
  forbidFlavors: [production, development]
  forbidBranches: [main]
  forbidFirebaseProjects: [hedged-core-production]
  forbidShorebirdRelease: true
`;

describe('project manifest', () => {
  it('parses the hedged staging manifest', () => {
    const m = parseProjectManifest(HEDGED_STAGING, 'hedged.yaml');
    expect(m.id).toBe('hedged');
    expect(m.flavorDefault).toBe('staging');
    expect(m.git.base).toBe('stag');
    expect(m.git.agentMayPush).toBe(false); // default
  });

  it('rejects a flavorDefault that is also forbidden', () => {
    const bad = HEDGED_STAGING.replace('forbidFlavors: [production, development]', 'forbidFlavors: [staging]');
    expect(() => parseProjectManifest(bad, 'bad.yaml')).toThrow(/forbidFlavors/);
  });

  it('rejects a flavorDefault outside allowedFlavors', () => {
    const bad = HEDGED_STAGING.replace('allowedFlavors: [staging]', 'allowedFlavors: [development]');
    expect(() => parseProjectManifest(bad, 'bad.yaml')).toThrow(/allowedFlavors/);
  });
});

describe('guardrails (staging-only pilot)', () => {
  const m = parseProjectManifest(HEDGED_STAGING, 'hedged.yaml');

  it('allows the staging flavor', () => {
    expect(flavorBlockedReason(m, 'staging')).toBeNull();
    expect(resolveBuildFlavor(m, 'staging')).toBe('staging');
    expect(resolveBuildFlavor(m)).toBe('staging'); // falls back to default
  });

  it('blocks production and development flavors', () => {
    expect(flavorBlockedReason(m, 'production')).toMatch(/forbidden/);
    expect(() => resolveBuildFlavor(m, 'production')).toThrow(GuardrailError);
  });

  it('blocks pushing to main', () => {
    expect(branchBlockedReason(m, 'main')).toMatch(/forbidden/);
    expect(branchBlockedReason(m, 'stag')).toBeNull();
  });
});
