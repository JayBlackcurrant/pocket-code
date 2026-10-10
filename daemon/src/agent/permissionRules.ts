/**
 * Permission rules (S2-02). Evaluated before a tool call is parked for the phone:
 * - `deny`  → the tool is refused immediately and never runs (dangerous commands).
 * - `allow` → auto-approved without asking (safe, read-only / known-good).
 * - `ask`   → routed to the phone via the permission broker (S2-01).
 *
 * Deny always wins (checked first), so `flutter test && sudo rm -rf /` is denied.
 * Mirrors the policy in CLAUDE.md.
 */
export type RuleDecision = 'allow' | 'deny' | 'ask';

export interface RuleResult {
  decision: RuleDecision;
  reason?: string;
}

const READ_ONLY_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** Dangerous Bash patterns — denied wherever they appear in the command. */
const DANGEROUS: Array<{ re: RegExp; why: string }> = [
  { re: /\bsudo\b/, why: 'sudo is not allowed' },
  { re: /\brm\s+-\S*r/i, why: 'recursive delete (rm -r) is not allowed' },
  {
    re: /\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh)\b/i,
    why: 'piping a download into a shell is not allowed',
  },
  { re: /\bgit\s+push\b/, why: 'the agent must not push; the daemon pushes branches' },
  { re: /\bsecurity\s+(?:find|add|delete|dump|unlock|import|export)/i, why: 'keychain access is not allowed' },
  { re: /\b(?:shutdown|reboot|halt)\b/, why: 'system power commands are not allowed' },
  { re: /:\(\)\s*\{\s*:/, why: 'fork bomb is not allowed' },
  { re: /\bmkfs\b/, why: 'formatting a filesystem is not allowed' },
  { re: /\bdd\b[^\n]*\bof=\/dev\//, why: 'writing to a device is not allowed' },
];

/** Known-safe single Bash commands (auto-allowed only when unchained). */
const SAFE_BASH: RegExp[] = [
  /^fvm\s+flutter\s+(?:analyze|test)\b/,
  /^flutter\s+(?:analyze|test)\b/,
  /^fvm\s+dart\s+(?:format|analyze)\b/,
  /^dart\s+(?:format|analyze)\b/,
  /^git\s+(?:status|diff|log|show|branch|rev-parse|ls-files)\b/,
];

/** Shell metacharacters that chain/compose commands — disqualify auto-allow. */
const CHAINING = /[;&|`]|\$\(/;

export function evaluatePermission(
  toolName: string,
  input: Record<string, unknown>,
): RuleResult {
  if (READ_ONLY_TOOLS.has(toolName)) return { decision: 'allow' };
  // Edits are scoped to the task worktree (cwd); acceptEdits also handles these.
  if (EDIT_TOOLS.has(toolName)) return { decision: 'allow' };
  if (toolName === 'Bash') return evaluateBash(input);
  // Network / unknown tools (WebFetch, WebSearch, Task, …) ask the phone.
  return { decision: 'ask' };
}

function evaluateBash(input: Record<string, unknown>): RuleResult {
  const command = typeof input.command === 'string' ? input.command.trim() : '';
  if (command === '') return { decision: 'ask' };

  for (const { re, why } of DANGEROUS) {
    if (re.test(command)) return { decision: 'deny', reason: why };
  }
  if (!CHAINING.test(command) && SAFE_BASH.some((re) => re.test(command))) {
    return { decision: 'allow' };
  }
  return { decision: 'ask' };
}
