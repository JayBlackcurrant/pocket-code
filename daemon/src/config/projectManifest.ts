import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/**
 * Per-project manifest. The daemon's build/codegen/git/distribution services are
 * generic; everything that differs between the registered Flutter repos lives here.
 * See daemon/config/projects/hedged.yaml for the worked pilot example.
 */
const CodegenSchema = z.object({
  requiresSibling: z.string().optional(),
  steps: z.array(z.string()).default([]),
});

const BuildSchema = z.object({
  apk: z.string(),
  bundle: z.string().optional(),
});

const ShorebirdSchema = z.object({
  patch: z.string().optional(),
  release: z.string().optional(),
  appIds: z.record(z.string(), z.string()).default({}),
});

const SigningSchema = z.object({
  mode: z.enum(['in-repo', 'external']),
  flavor: z.string().optional(),
});

const GitSchema = z.object({
  remote: z.string(),
  base: z.string(),
  branchPrefix: z.string().default('claude/'),
  commitStyle: z.enum(['conventional', 'plain']).default('conventional'),
  agentMayPush: z.boolean().default(false),
});

const FirebaseAppDistSchema = z.object({
  firebaseProject: z.string(),
  appId: z.string(),
  groups: z.array(z.string()).default([]),
  serviceAccountEnv: z.string().default('GOOGLE_APPLICATION_CREDENTIALS'),
  uploadCmd: z.string(),
});

/**
 * Keyless distribution: the daemon serves the built APK over its own Tailscale HTTPS and
 * hands the app a signed, time-limited download link. No Google service account required;
 * testers must be on the tailnet.
 */
const TailscaleServeSchema = z.object({
  // How long a generated download link stays valid (minutes). Default 7 days, max 30.
  linkTtlMinutes: z.number().int().positive().max(43_200).default(10_080),
});

const DistributionSchema = z.object({
  firebaseAppDistribution: FirebaseAppDistSchema.optional(),
  tailscaleServe: TailscaleServeSchema.optional(),
});

const GuardrailsSchema = z.object({
  forbidFlavors: z.array(z.string()).default([]),
  forbidBranches: z.array(z.string()).default([]),
  forbidFirebaseProjects: z.array(z.string()).default([]),
  forbidShorebirdRelease: z.boolean().default(false),
});

export const ProjectManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be kebab-case'),
    displayName: z.string().optional(),
    path: z.string(),
    flutter: z.enum(['fvm', 'system']).default('fvm'),
    flavorDefault: z.string().optional(),
    allowedFlavors: z.array(z.string()).default([]),
    codegen: CodegenSchema.default({ steps: [] }),
    generatedGlobs: z.array(z.string()).default([]),
    build: BuildSchema,
    shorebird: ShorebirdSchema.optional(),
    signing: SigningSchema,
    git: GitSchema,
    distribution: DistributionSchema.default({}),
    guardrails: GuardrailsSchema.default({
      forbidFlavors: [],
      forbidBranches: [],
      forbidFirebaseProjects: [],
      forbidShorebirdRelease: false,
    }),
  })
  .superRefine((m, ctx) => {
    // A default flavor must be one the daemon is allowed to use.
    if (
      m.flavorDefault !== undefined &&
      m.allowedFlavors.length > 0 &&
      !m.allowedFlavors.includes(m.flavorDefault)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['flavorDefault'],
        message: `flavorDefault "${m.flavorDefault}" is not in allowedFlavors [${m.allowedFlavors.join(', ')}]`,
      });
    }
    // The default flavor must not also be forbidden — catches contradictory config.
    if (m.flavorDefault !== undefined && m.guardrails.forbidFlavors.includes(m.flavorDefault)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['flavorDefault'],
        message: `flavorDefault "${m.flavorDefault}" is also listed in guardrails.forbidFlavors`,
      });
    }
    // The push target branch must not be forbidden.
    if (m.guardrails.forbidBranches.includes(m.git.base)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['git', 'base'],
        message: `git.base "${m.git.base}" is listed in guardrails.forbidBranches`,
      });
    }
  });

export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;

/** Parse and validate a single manifest from YAML text. */
export function parseProjectManifest(yamlText: string, sourceLabel: string): ProjectManifest {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (cause) {
    throw new Error(`Failed to parse manifest YAML (${sourceLabel}): ${(cause as Error).message}`);
  }
  const result = ProjectManifestSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid project manifest (${sourceLabel}):\n${result.error.issues
        .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n')}`,
    );
  }
  return result.data;
}

/**
 * Load every *.yaml manifest from a directory, keyed by project id.
 * Throws on a duplicate id so misconfiguration fails loudly at startup.
 */
export function loadProjectManifests(dir: string): Map<string, ProjectManifest> {
  const byId = new Map<string, ProjectManifest>();
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  } catch (cause) {
    throw new Error(`Cannot read projects directory "${dir}": ${(cause as Error).message}`);
  }

  for (const file of entries.sort()) {
    const full = join(dir, file);
    const manifest = parseProjectManifest(readFileSync(full, 'utf8'), file);
    if (byId.has(manifest.id)) {
      throw new Error(`Duplicate project id "${manifest.id}" (in ${file})`);
    }
    byId.set(manifest.id, manifest);
  }
  return byId;
}
