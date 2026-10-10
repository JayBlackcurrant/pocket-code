# Agent Mac — progress log

> **Cross-device progress log for the Mac / daemon / infra side of PocketCode.**
> Partner file: [`app_progress.md`](app_progress.md) (Flutter app side).
> Both Claude Code instances read **both** files at the start of every session so the two
> devices stay in sync. See `CLAUDE.md` → "Progress tracking".
>
> **Conventions:** newest entry on top of the Log. Keep secrets OUT — no bearer/pairing
> codes, API keys, or tailnet/MagicDNS names (those live only in `daemon/env.sh`, git-ignored).

**Last updated:** 2026-10-10 — Sprint 2 reviewed & running here; agent SDK upgraded (0.1.77→0.3.296, zod 3→4) to fix a live 400; runner logging added

---

## Status snapshot

| Area | State |
|------|-------|
| Daemon Sprint 1 (S1-01…S1-07) | ✅ present & passing |
| Daemon Sprint 2 (S2-01/02/03/05/06/09) | ✅ pulled & running here; typecheck clean, **97/97 tests** |
| Agent SDK version | ✅ **0.3.296** (upgraded from 0.1.77; required zod 3→4) — fixes the duplicate-`tool_use`-id 400 |
| Runner error logging | ✅ added — `agent run returned an error result` / `task failed` → daemon log |
| Mac setup (clean clone → running) | ✅ done per `AGENT_MAC_SETUP.md` |
| `hedged` project resolution | ✅ `active` (`/healthz` → `{"ok":true,"projects":1}`) |
| Tailscale HTTPS exposure | ✅ `serve` active, **tailnet-only** (no public Funnel) |
| Device pairing | ✅ paired & connected; re-paired 2026-10-10 after restarts |
| Live agent task (end-to-end) | 🟡 first run hit a 400 (SDK bug); re-testing after the SDK upgrade |
| Always-on service (S4-01 LaunchAgent) | ⬜ **not set up** — runs under `caffeinate` only; no reboot survival |
| Daemon currently running? | ✅ **yes** — background under `caffeinate`, fresh with SDK 0.3.296 |

---

## Environment (this Mac)

- **Repo:** `~/workspaces/pocket-code` (daemon in `daemon/`). *Note: `AGENT_MAC_SETUP.md` calls it `claude-app`; folder name doesn't matter — resolution keys off `AGENT_HOME`.*
- **Managed project:** `~/workspaces/hedged-core-app`, on branch **`stag`** (switched from `main` during setup; matches manifest `git.base: stag`).
- **Node:** v24.10.0 · **Claude auth:** logged-in Claude Code subscription (no `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` set — intentional).
- **Daemon bind:** `127.0.0.1:8787` (never `0.0.0.0`). Fronted by `tailscale serve` HTTPS → `127.0.0.1:8787`.
- **Per-machine config:** `daemon/env.sh` (git-ignored) holds real paths + the MagicDNS advertise URL.

---

## Runbook (quick)

```bash
# start daemon (keeps running through sleep)
cd ~/workspaces/pocket-code/daemon && source env.sh && caffeinate -dimsu npm run dev
# health
curl -s http://127.0.0.1:8787/healthz          # -> {"ok":true,"projects":1}
# re-pair a phone (one-time code; scan the QR from the terminal, not from chat)
cd ~/workspaces/pocket-code/daemon && source env.sh && npm run pair
# tailscale exposure
tailscale serve status
```

---

## Next up (Mac / daemon side)

- [x] Daemon SDK upgrade + zod 4 + runner logging — **committed by the user as `3e0a721` on `main` and pushed** (dev side can pull). *(Landed directly on `main`, not a `claude/` branch.)*
- [ ] **Re-verify a live agent task** from the phone now that the SDK is upgraded (the earlier 400 should be gone).
- [ ] **S4-01** — LaunchAgent plist with `KeepAlive` for real reboot/crash survival (deferred; user chose "leave as-is for now" on 2026-10-09). Keeps biting pairing: when the daemon is stopped/rebooted nothing restarts it.
- [ ] Confirm task worktrees land somewhere sensible (`RELAYD_WORKSPACES_DIR` is unset; verify a real task run creates a worktree inside the allowlist).
- [ ] **S4-05 hardening:** `permissionRules` `git push` deny regex misses `git -C <path> push` — tighten it.
- [ ] Confirm **S2-04 "Always allow"** behavior — no server-side rule persistence yet; check whether it re-asks on the next identical tool.
- [ ] `npm audit`: 6 vulns (3 moderate / 1 high / 2 critical) — triage before the hardening sprint (don't `--force` blindly).

---

## Log

### 2026-10-10 — Project file search endpoint — built on the dev machine
- `GET /projects/:id/search?q=` for @-mention autocomplete: recursive `searchFiles`
  (`fs/fileReader.ts`), bounded (≤50 results, ≤20k files scanned), hides the same heavy dirs,
  basename/short-path ranking. Active projects only. **Tested:** 102/102 (3 search cases).
- **➡️ Action on this Mac:** `git pull` + restart (serves the new search endpoint).

### 2026-10-10 — Project browser endpoints — built on the dev machine
- New project-scoped, path-safe endpoints for the app's project browser:
  `GET /projects/:id/tree?path=` (one directory; dirs first; hides .git/node_modules/build/
  .dart_tool/.fvm/etc.) and `GET /projects/:id/files?path=` (reuses `readFileSafe`). Both
  require the project `active`. New `listDir` + `NotADirectoryError` in `fs/fileReader.ts`.
- **Tested:** 99/99 (added listDir dir-first + non-directory cases).
- **➡️ Action on this Mac:** `git pull` + restart to serve the new endpoints.

### 2026-10-10 — pulled Sprint 2, debugged a live 400, upgraded the agent SDK (on this Mac)
Reviewed all of Sprint 2 here, then debugged the first live run and upgraded the SDK:
- **Sprint 2 review:** at HEAD (`main` == `origin/main`); typecheck clean, **97/97 tests**. Verified
  the security-sensitive bits I run: sandbox on by default, `canUseTool` deny/allow/ask wiring,
  push triple-guarded (`branchBlockedReason` + `claude/*`-only + Bash `git push` deny), `execFile`
  (no shell), path-safe file/diff/revert. Flags: push regex bypass via `git -C`; no server-side
  "always allow" persistence; parked approvals don't survive a daemon restart (S4-02 territory).
- **Live 400 debugged:** first real task from the phone failed; the app showed "claude return 400".
  Root cause (from the event log, not the console — which logged nothing): `400
  invalid_request_error — "tool_use ids must be unique"`, the bundled Claude Code (2.0.77) emitting
  duplicate tool_use ids under parallel tool calls. Not our code — the SDK builds those messages.
- **Added runner logging** (`agentRunner.ts` + `index.ts`): `agent run returned an error result`
  (logs the API error text + `request_id`), `task failed`, and `task started`/`task completed`
  info lines, routed through fastify's pino logger. Future failures now show in the daemon log.
- **Upgraded the agent SDK 0.1.77 → 0.3.296** (user approved). Forced peer bump **zod 3 → 4**;
  migrated (vanilla usage; the one `.url()` still compiles). Typecheck clean, **97/97 tests**.
  Restarted the daemon fresh (in-place `npm install` doesn't reload a running process); healthy on
  local + Tailscale paths; minted a fresh pairing QR for re-test.
- **Committed by the user as `3e0a721`** on `main` (SDK upgrade + zod 4 + runner logging) and
  pushed to origin — the dev side can pull it. (Landed on `main`, not a `claude/` branch.)
- **Tested:** typecheck, 97 tests, `/healthz` (local + HTTPS). **Not yet verified:** a clean live
  agent task end-to-end after the upgrade (awaiting the phone re-test).

### 2026-10-10 — S2-09 git actions (daemon) — built on the dev machine
- `GitService`: `commitAll` (stage+commit, "nothing to commit" via `status --porcelain`),
  `revertFile` (restore tracked / delete untracked, path-safe), `pushBranch` (**refuses any
  non-`claude/*` branch**), `suggestCommitMessage`. Endpoints: `GET /tasks/:id/commit-message`,
  `POST /tasks/:id/commit` `{message?}`, `POST /tasks/:id/revert` `{path}`,
  `POST /tasks/:id/push`, `POST /tasks/:id/discard` (cancel → remove worktree+branch → status
  `discarded`). Push is guarded by `branchBlockedReason` (manifest forbids `main`).
- **The daemon is the only pusher** (CLAUDE.md); the agent never pushes. Commits use a
  `PocketCode <agent@pocketcode.local>` identity for now (make configurable later if you want
  your own authorship on `claude/*`).
- **Tested:** 97/97 (commit + nothing-to-commit, revert tracked/untracked, **push a claude/\*
  branch to a bare remote**, refuse pushing `main`).
- **➡️ Action on this Mac:** `git pull` + restart. First real **push** needs the GitHub remote
  reachable + auth as the `agent` user (SSH key or gh token) — verify before trying from the phone.

### 2026-10-10 — S2-06 file reader — built on the dev machine
- `readFileSafe` (`src/fs/fileReader.ts`): read-only file read inside a task worktree, through
  the same path-safety chokepoint (`..`/symlink escape → 403). Binary detection (null byte →
  no text), size cap (512KB, `truncated` flag), typed errors for missing (404) / directory (400).
- New endpoint: `GET /tasks/:id/files?path=` → `{ path, size, binary, truncated, content }`.
- **Tested:** 92/92 (7 new reader tests incl. the **no-path-traversal** acceptance — `..` and
  symlink escapes rejected — plus binary, truncation, missing, directory).
- **➡️ Action on this Mac:** `git pull` + restart (no new env). Daemon read side for review is
  now complete (S2-05 diff + S2-06 files); next is the app review UI (S2-07/08).

### 2026-10-10 — S2-05 diff endpoints — built on the dev machine
- `GitService.diffSummary` / `diffFile` (in `src/git/gitService.ts`): changed files vs the
  project base (manifest `git.base`), with rename detection, +/- counts, untracked files, and
  binary flags; per-file unified patch (`-U3`) with size caps (`DIFF_MAX_LINES=5000`,
  `DIFF_MAX_BYTES=512KB`, `truncated` flag). Uses a diff-tolerant git runner (exit code 1 =
  differences, not an error).
- New endpoints: `GET /tasks/:id/diff/summary` → `{ base, files[] }`; `GET /tasks/:id/diff?path=`
  → `{ path, binary, truncated, patch }`. Path is validated against the worktree (403 on escape).
- **Tested:** 85/85 (6 new git diff tests incl. the **3000-line file handled without crash**
  acceptance, truncation, untracked, binary, rename, and path-escape rejection).
- **➡️ Action on this Mac:** `git pull` + restart (no new env needed). App review screens are S2-07/08.

### 2026-10-10 — S2-03 approval timeout — built on the dev machine
- A parked permission now auto-denies after a timeout (default **120 min**, env
  `RELAYD_APPROVAL_TIMEOUT_MINUTES`, `0` = wait forever) with the message *"User unavailable…
  stop and summarize"* and `interrupt:false` so the agent wraps up instead of hanging. Emits
  `agent.permission_timeout`; approval row → `timed_out`. Decision/abort clears the timer.
- **Tested:** 79/79 (2 new broker tests: fires on timeout; a decision cancels the timer).
- **➡️ Action on this Mac:** `git pull` + restart (picks up S2-01/02/03 together).

### 2026-10-10 — S2-02 permission rules + sandbox — built on the dev machine
Layered on top of S2-01 (pull + restart to run):
- New `src/agent/permissionRules.ts`: before a tool call parks, it's evaluated — **deny**
  (dangerous: `sudo`, `rm -r`, `curl|sh`, `git push`, keychain, shutdown, mkfs, dd to device)
  → refused immediately, **never runs**; **allow** (read-only tools, edits, and single safe
  commands: `flutter/dart analyze|test`, `dart format`, read-only `git`) → auto-approved;
  everything else → asks the phone. Deny always wins (checked before allow), so
  `flutter test && sudo rm -rf /` is denied.
- Sandbox ON by default (`src/agent/sandbox.ts`): `sandbox.enabled` + network allowlist
  (pub.dev, GitHub, Google Maven, Firebase). Toggle with **`RELAYD_SANDBOX=off`** in `env.sh`
  if a real build fails under the sandbox while investigating. `autoAllowBashIfSandboxed` is
  left off so bash still goes through the rules.
- **Tested:** typecheck clean; **77/77** tests (new `permissionRules.test.ts` 25 cases +
  2 runner tests proving a dangerous command is auto-denied and never parked/run).
- **➡️ Action on this Mac:** `git pull` + restart. Watch the first real task: if a `flutter`
  build fails oddly, try `RELAYD_SANDBOX=off` and note it here.

### 2026-10-10 — S2-01 approvals (canUseTool bridge) — built on the dev machine
Daemon code for **S2-01** landed (authored from the dev Mac; this Mac must `git pull` +
restart to run it):
- New `src/agent/permissionBroker.ts`: tool calls needing permission **park** (persisted to a
  new `approvals` table, status `pending`), emit `agent.permission_request`, and the agent
  waits on an unresolved promise — even while the phone is offline. The phone resolves via a
  new endpoint and the agent resumes; abort/cancel settles as deny+interrupt.
- `AgentRunner` now passes `canUseTool` into `query()` and exposes
  `decidePermission` / `listPendingPermissions`; task goes `waiting` while parked, back to
  `running` on a decision. Edits still auto-accept (`acceptEdits`); other tools (Bash, etc.)
  route to the phone.
- New endpoints: `GET /tasks/:id/permissions` (list pending, for reconnect) and
  `POST /tasks/:id/permissions/:toolUseId` `{decision:'allow'|'deny', reason?, input?}`.
- **Tested:** typecheck clean; **50/50** tests (new `permissionBroker.test.ts` + an HTTP
  integration test: agent parks → `waiting` → phone approves → resumes → `done` → re-decide 404).
- **Not an auto-allow list yet** — every non-edit tool currently asks. Allow/deny rules +
  `acceptEdits` tuning are **S2-02**. App-side approval cards are **S2-04**.
- **➡️ Action on this Mac:** `cd ~/workspaces/pocket-code && git pull` then restart the daemon.

### 2026-10-09 — Mac setup from a clean clone (`AGENT_MAC_SETUP.md`)
Performed the full agent-Mac setup and verified end-to-end:
- Confirmed prereqs: Node 24, git, Tailscale (Mac + phone on tailnet), `claude` CLI; `claude -p "say hi"` works (subscription auth, no key).
- `hedged-core-app`: was on `main`, **checked out `stag`** (clean tree).
- `daemon`: `npm ci` (345 pkgs) → `npm run typecheck` clean → `npm test` **44/44 pass**.
- Created `daemon/env.sh` with real paths + MagicDNS advertise URL; left Claude creds unset (uses subscription).
- **Fix:** `daemon/.gitignore` only ignored `.env*`, not `env.sh` (which the guide claims is ignored) → added `env.sh` to `.gitignore`. Confirmed ignored. *(Change is uncommitted on `main`.)*
- Started daemon under `caffeinate`: log shows `projects:[{id:'hedged',status:'active'}]`, bound to `127.0.0.1:8787`.
- `/healthz` = `{"ok":true,"projects":1}` over localhost **and** over the Tailscale HTTPS URL.
- `tailscale serve` confirmed: HTTPS → `127.0.0.1:8787`, **tailnet-only**.
- `npm run pair` generated a one-time QR; **phone (`realme-11-pro-5g`) paired and connected successfully** (user confirmed). Verifies S1-02 pairing end-to-end.
- Decided (user): **not** installing the S4-01 LaunchAgent yet — daemon runs under `caffeinate` for now.
- **Tested:** typecheck, 44 tests, `/healthz` (local + HTTPS), live pairing. **Not verified:** a real agent task run / worktree creation; reboot survival.
