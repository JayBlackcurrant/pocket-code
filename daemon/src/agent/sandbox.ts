import type { SandboxSettings } from '@anthropic-ai/claude-agent-sdk';

/**
 * Network allowlist for sandboxed command execution (CLAUDE.md: pub.dev, GitHub,
 * Google Maven, Firebase). Only reachable hosts for bash inside the sandbox.
 */
export const NETWORK_ALLOWLIST: string[] = [
  'pub.dev',
  'pub.dartlang.org',
  'storage.googleapis.com',
  'github.com',
  'codeload.github.com',
  'objects.githubusercontent.com',
  'raw.githubusercontent.com',
  'maven.google.com',
  'dl.google.com',
  'services.gradle.org',
  'plugins.gradle.org',
  'firebase.googleapis.com',
  'firebaseappdistribution.googleapis.com',
];

/**
 * Sandbox ON (CLAUDE.md). `autoAllowBashIfSandboxed` is intentionally left off so bash
 * still flows through our permission rules + the phone bridge, not auto-allowed.
 */
export function defaultSandbox(): SandboxSettings {
  return {
    enabled: true,
    network: { allowedDomains: NETWORK_ALLOWLIST },
  };
}
