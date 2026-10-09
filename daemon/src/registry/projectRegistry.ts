import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectManifest } from '../config/projectManifest.js';
import { assertWithinAllowlist, PathNotAllowedError } from '../fs/pathSafety.js';

export type ProjectStatus = 'active' | 'unresolved' | 'rejected';

export interface RegisteredProject {
  manifest: ProjectManifest;
  status: ProjectStatus;
  /** Canonical, allowlisted path (only when status === 'active'). */
  resolvedPath?: string;
  /** Why the project is unresolved or rejected. */
  reason?: string;
}

/** Expand ${VAR} references from the environment. Returns the expanded string and
 *  whether any placeholder remained unexpanded (missing env var, or a <...> stub). */
function expandEnv(value: string, env: NodeJS.ProcessEnv): { expanded: string; hasUnresolved: boolean } {
  let hasUnresolved = false;
  const expanded = value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_m, name: string) => {
    const v = env[name];
    if (v === undefined || v === '') {
      hasUnresolved = true;
      return `\${${name}}`;
    }
    return v;
  });
  // A leftover <PLACEHOLDER> (as used in example manifests) is also unresolved.
  if (/[<>]/.test(expanded)) hasUnresolved = true;
  return { expanded, hasUnresolved };
}

/**
 * Holds the registered projects and enforces the path allowlist (S1-03). A manifest
 * whose path resolves outside the allowlist is 'rejected'; one whose path still has an
 * unexpanded placeholder (e.g. ${AGENT_HOME}) is 'unresolved'. Only 'active' projects
 * are served for task/build work.
 */
export class ProjectRegistry {
  private readonly byId = new Map<string, RegisteredProject>();

  constructor(
    manifests: Iterable<ProjectManifest>,
    private readonly allowedRoots: string[],
    env: NodeJS.ProcessEnv = process.env,
  ) {
    for (const manifest of manifests) {
      this.byId.set(manifest.id, classify(manifest, allowedRoots, env));
    }
  }

  get(id: string): RegisteredProject | undefined {
    return this.byId.get(id);
  }

  /** Only active (allowlisted, resolvable) projects. */
  getActive(id: string): RegisteredProject | undefined {
    const p = this.byId.get(id);
    return p?.status === 'active' ? p : undefined;
  }

  list(): RegisteredProject[] {
    return [...this.byId.values()];
  }

  /**
   * Validate a candidate repo path for registration: must be absolute and resolve
   * inside the allowlist. Throws PathNotAllowedError when it does not. Returns the
   * canonical path and whether it looks like a git repo.
   */
  validateRegistrablePath(candidate: string): { canonicalPath: string; isGitRepo: boolean } {
    const canonicalPath = assertWithinAllowlist(candidate, this.allowedRoots);
    return { canonicalPath, isGitRepo: existsSync(join(canonicalPath, '.git')) };
  }
}

function classify(
  manifest: ProjectManifest,
  allowedRoots: string[],
  env: NodeJS.ProcessEnv,
): RegisteredProject {
  const { expanded, hasUnresolved } = expandEnv(manifest.path, env);
  if (hasUnresolved) {
    return {
      manifest,
      status: 'unresolved',
      reason: `path has an unexpanded placeholder: "${manifest.path}"`,
    };
  }
  try {
    const resolvedPath = assertWithinAllowlist(expanded, allowedRoots);
    return { manifest, status: 'active', resolvedPath };
  } catch (err) {
    const reason =
      err instanceof PathNotAllowedError ? err.message : `path validation failed: ${String(err)}`;
    return { manifest, status: 'rejected', reason };
  }
}
