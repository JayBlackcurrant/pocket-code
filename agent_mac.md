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
| Approvals bridge (S2-01 `canUseTool`) | ✅ code done (dev machine) — **needs `git pull` + restart here** (50/50 tests) |
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
