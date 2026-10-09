# relayd — PocketCode daemon

Runs on the Mac. Drives Claude Code via the Agent SDK, manages git worktrees, builds,
and distribution for the registered Flutter projects. See `../PROJECT_DESCRIPTION.md`.

## Status

Early scaffold. Implemented so far:

- **S1-01** Env config loader with a public-bind guard (`src/config/env.ts`) — refuses `0.0.0.0`.
- **S1-01** Per-project manifest schema + loader (`src/config/projectManifest.ts`).
- **S1-01** Runtime guardrails that keep the hedged pilot **staging-only** (`src/guardrails.ts`).
- **S1-01** SQLite event-log schema (`src/db/db.ts`) — events get a monotonic `seq`.
- **S1-02** Device pairing + bearer-token auth (`src/auth/*`, `src/cli/pair.ts`): QR pairing
  on the Mac, one-time codes (hash stored), tokens (hash stored, constant-time compare),
  auth middleware (unpaired → 401), and device list/revoke.
- **S1-03** Project registry + path allowlist (`src/registry/projectRegistry.ts`,
  `src/fs/pathSafety.ts`): manifest paths are validated against `RELAYD_ALLOWED_ROOTS`
  (`..`/symlink/absolute escapes blocked); projects are active/unresolved/rejected.
  `POST /projects` validates a candidate repo path (403 when outside the allowlist).
- **S1-04** Git worktree service (`src/git/gitService.ts`): one worktree per task under
  `<repo>/.worktrees/<taskId>` on branch `claude/<slug>`, branched from the manifest base
  (e.g. `stag`). Race-safe branch naming (parallel same-slug tasks fall back to `-2`, `-3`),
  clean discard (remove worktree + delete the `claude/*` branch), and `.worktrees/` auto-added
  to the repo's local `info/exclude`.
- **S1-05** Agent runner (`src/agent/agentRunner.ts`, `src/db/eventLog.ts`, `src/db/taskStore.ts`):
  runs the Agent SDK `query()` with `cwd` set to the task's worktree, writes every message to the
  event log with a monotonic `seq` (event-log-first), and on completion stores the session id and
  cost on the task. Supports cancel via `interrupt()`/abort. The SDK `query` is injectable, so the
  runner is unit-tested with a fake generator (no live API). Never `bypassPermissions`.
- **S1-06** WebSocket stream with replay (`WS /tasks/:id/stream?since=<seq>` in `src/server.ts`):
  subscribes to live events, replays everything after `since` from SQLite, then tails live events —
  so a reconnecting phone loses nothing and sees no duplicates. Auth is enforced on the upgrade via
  the same bearer-token `requireAuth`. Sends a `stream.caughtup` marker after replay.
- **S1-07** Cancel endpoint (`POST /tasks/:id/cancel`): interrupts a running task via the
  runner; the agent unwinds and `task.cancelled` is emitted over the stream within seconds.
  404 unknown task, 409 if already finished or not running on this daemon.
- Fastify server (`src/server.ts`): public `/healthz` and `/pair`; authenticated `/projects`
  (+ `POST /projects`), `/projects/:id/build-command`, `POST /projects/:id/tasks`,
  `GET /tasks/:id`, `GET /tasks/:id/events?since=`, `POST /tasks/:id/cancel`,
  `WS /tasks/:id/stream?since=`, `/devices`, `/devices/:id/revoke`.

This completes the Sprint 1 daemon side (start → stream → cancel). Not yet built: approvals (S2),
build + Firebase distribution (S3), and the Flutter app shell (S1-08…10). The runner's permission
mode defaults to `acceptEdits`; the approval bridge (`canUseTool`) arrives in S2.

## Pairing a phone

On the Mac, with the daemon running:

```bash
npm run pair   # prints a QR (and a paste-able pocketcode:// link); valid ~5 min
```

The phone scans it and calls `POST /pair` to receive its bearer token (returned once).
For a phone over Tailscale, set `RELAYD_ADVERTISE_URL` to the Mac's MagicDNS URL first so
the QR points at the right host.

## Project manifests

Each registered repo has a manifest in `config/projects/<id>.yaml`. It is the only thing
that differs per project; the daemon services are generic and read from it. The pilot
example is `config/projects/hedged.yaml` (staging only, production actions forbidden).

## Run locally

```bash
npm install
cp .env.example .env   # defaults bind to 127.0.0.1:8787
npm run dev
# public:
#   curl localhost:8787/healthz
# pair to get a token (run in another shell): npm run pair  -> copy the code
#   TOKEN=$(curl -s -XPOST localhost:8787/pair -H 'content-type: application/json' \
#            -d '{"code":"<code>","deviceName":"dev"}' | jq -r .token)
# authenticated:
#   curl localhost:8787/projects -H "authorization: Bearer $TOKEN"
#   curl localhost:8787/projects/hedged/build-command -H "authorization: Bearer $TOKEN"
#   curl "localhost:8787/projects/hedged/build-command?flavor=production" -H "authorization: Bearer $TOKEN"  # 409 guardrail
```

## Checks

```bash
npm run typecheck
npm test
```

## Security notes (see root CLAUDE.md)

- Binds to `127.0.0.1` or the Tailscale interface only — never `0.0.0.0`.
- Claude credentials come from env/Keychain (API key or Team credits). Never read
  subscription login tokens from `~/.claude`.
- The daemon pushes branches; the agent never runs `git push`.
