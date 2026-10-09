# pocket-code

Remotely control Claude Code running on a spare Mac from your phone: start tasks, watch
them stream, review changes, and (later) build & ship to testers — over Tailscale.

## Layout

| Path | What |
|------|------|
| `daemon/` | Node/TypeScript server (Fastify + Claude Agent SDK + SQLite). Runs on the Mac. |
| `app/` | Flutter client (Riverpod + AutoRoute). Pairs with the daemon and drives tasks. |
| `PROJECT_DESCRIPTION.md`, `ROADMAP.md`, `SPRINT_PLAN.md` | Planning docs. |
| `RUNNING.md` | How to run the daemon and app (VS Code + terminal). |
| `CLAUDE.md` | Working rules for this repo. |

## Quick start

See **[RUNNING.md](RUNNING.md)**. In short:

```bash
cd daemon && npm ci && source env.sh && npm run dev
```

```bash
cd app && fvm flutter pub get && fvm dart run build_runner build --delete-conflicting-outputs && fvm flutter run
```

## Status

Sprint 1 complete: pair, list projects, start a task, watch it stream live (reconnect +
replay), and cancel. Approvals (Sprint 2) and build/distribute (Sprint 3) are next.
