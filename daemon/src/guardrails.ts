import type { ProjectManifest } from './config/projectManifest.js';

/**
 * Runtime guardrails. These are the last line of defence that keeps the pilot
 * staging-only: even if a caller asks for a production flavor/branch/Firebase
 * project, the daemon refuses before a command is ever constructed.
 *
 * Returns the reason a request is blocked, or null when it is allowed.
 */
export function flavorBlockedReason(m: ProjectManifest, flavor: string): string | null {
  if (m.guardrails.forbidFlavors.includes(flavor)) {
    return `flavor "${flavor}" is forbidden for project "${m.id}"`;
  }
  if (m.allowedFlavors.length > 0 && !m.allowedFlavors.includes(flavor)) {
    return `flavor "${flavor}" is not in allowedFlavors for project "${m.id}"`;
  }
  return null;
}

export function branchBlockedReason(m: ProjectManifest, branch: string): string | null {
  if (m.guardrails.forbidBranches.includes(branch)) {
    return `pushing to branch "${branch}" is forbidden for project "${m.id}"`;
  }
  return null;
}

export function firebaseProjectBlockedReason(m: ProjectManifest, project: string): string | null {
  if (m.guardrails.forbidFirebaseProjects.includes(project)) {
    return `uploading to Firebase project "${project}" is forbidden for project "${m.id}"`;
  }
  return null;
}

export function shorebirdReleaseBlockedReason(m: ProjectManifest): string | null {
  if (m.guardrails.forbidShorebirdRelease) {
    return `shorebird release is forbidden for project "${m.id}" (patch only)`;
  }
  return null;
}

/** Thrown when a guardrail blocks an action. */
export class GuardrailError extends Error {
  constructor(reason: string) {
    super(`Guardrail blocked: ${reason}`);
    this.name = 'GuardrailError';
  }
}

/** Resolve the flavor to build with, enforcing guardrails. */
export function resolveBuildFlavor(m: ProjectManifest, requested?: string): string {
  const flavor = requested ?? m.flavorDefault;
  if (flavor === undefined) {
    throw new GuardrailError(`no flavor requested and no flavorDefault set for "${m.id}"`);
  }
  const reason = flavorBlockedReason(m, flavor);
  if (reason) throw new GuardrailError(reason);
  return flavor;
}
