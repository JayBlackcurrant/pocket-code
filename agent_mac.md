# Agent Mac — progress log

> **Cross-device progress log for the Mac / daemon / infra side of PocketCode.**
> Partner file: [`app_progress.md`](app_progress.md) (Flutter app side).
> Both Claude Code instances read **both** files at the start of every session so the two
> devices stay in sync. See `CLAUDE.md` → "Progress tracking".
>
> **Conventions:** newest entry on top of the Log. Keep secrets OUT — no bearer/pairing
> codes, API keys, or tailnet/MagicDNS names (those live only in `daemon/env.sh`, git-ignored).

**Last updated:** 2026-10-10 — S2-01 daemon code added from the dev machine (needs pull+restart here)

---

## Status snapshot

| Area | State |
|------|-------|
| Daemon code (Sprint 1: S1-01…S1-07) | ✅ present & passing |
| Approvals bridge (S2-01 `canUseTool`) | ✅ code done (dev machine) — **needs `git pull` + restart here** |
| Permission rules + sandbox (S2-02) | ✅ code done (dev machine) — **needs `git pull` + restart here** |
| Approval timeout (S2-03) | ✅ code done (dev machine) — **needs `git pull` + restart here** (79/79 tests) |
| Mac setup (clean clone → running) | ✅ done per `AGENT_MAC_SETUP.md` |
| `hedged` project resolution | ✅ `active` (`/healthz` → `{"ok":true,"projects":1}`) |
| Tailscale HTTPS exposure | ✅ `serve` active, **tailnet-only** (no public Funnel) |
| Device pairing | ✅ phone paired & connected end-to-end (2026-10-09) |
| Always-on service (S4-01 LaunchAgent) | ⬜ **not set up** — runs under `caffeinate` only; no reboot survival |
| Daemon currently running? | ⚠️ **no** — last background run was stopped; restart when needed (see Runbook) |

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

- [ ] **S4-01** — LaunchAgent plist with `KeepAlive` for real reboot/crash survival (deferred; user chose "leave as-is for now" on 2026-10-09).
- [ ] Confirm task worktrees land somewhere sensible (`RELAYD_WORKSPACES_DIR` is unset; verify first real task run creates a worktree inside the allowlist).
- [ ] Commit the `daemon/.gitignore` change (added `env.sh`) on a `claude/` branch — currently uncommitted on `main`.
- [ ] `npm audit` reported 6 vulns (3 moderate / 1 high / 2 critical) in deps — triage before hardening sprint (don't `--force` blindly).

---

## Log

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
