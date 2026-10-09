# Project Description: PocketCode (working name)

> Working name is a placeholder. Rename freely.
> Place this file at `docs/PROJECT_DESCRIPTION.md` in the repo.

## 1. One-line summary

A Flutter mobile app that remotely controls Claude Code running on a spare MacBook, so a Flutter developer can request code changes, review diffs, and send a test build to testers through Firebase App Distribution, all from a phone.

## 2. Problem

- Claude Code only runs where the repo lives (the Mac). Away from the desk, there is no good way to start tasks, approve actions, review changes, or ship a test build.
- Anthropic's Remote Control covers chat and approvals, but not a one-tap "build and send to testers" flow or a Flutter-focused review experience.

## 3. Goals

1. Start, follow, and cancel Claude Code tasks on the Mac from the phone.
2. Approve or deny Claude's risky actions (shell commands, edits) from the phone.
3. Review code changes: file list, per-file diff, code viewer.
4. Commit, push a branch, and revert or discard changes from the phone.
5. Build an Android APK on the Mac and upload it to Firebase App Distribution with AI-written release notes.
6. Get push notifications when a task finishes, needs approval, or a build is ready.

## 4. Non-goals (MVP)

- iOS builds, TestFlight, or Apple signing (testers are Android only).
- Multi-user or multi-tenant use. Single user, personal tool.
- Editing code by hand in the app (read-only viewer; changes go through Claude).
- Running Claude Code on the phone or in a cloud sandbox.
- Publishing the client app to the Play Store or App Store (sideload or distribute via Firebase to self).

## 5. User

One Flutter developer (the owner) with a Claude Team account and one spare MacBook.

## 6. Setup facts and assumptions

| # | Item | Status |
|---|------|--------|
| 1 | Claude Code runs on a spare **MacBook**, kept awake, lid open, plugged in | Confirmed |
| 2 | Testers use **Android only** | Confirmed |
| 3 | Claude plan: **Team** | Confirmed |
| 4 | Builds run on the same Mac | Assumption (flag: move to CI if the Mac is unreliable) |
| 5 | Personal use, one user | Assumption |
| 6 | Server authenticates to Claude with an **API key or the Team plan's bundled API credits**, never with copied subscription login tokens | Safe default (Anthropic's rules on this changed several times in 2026; re-check before relying on it) |
| 7 | Remote access via **Tailscale only**, no public ports | Safe default |

## 7. System overview

```
Phone (Flutter app)
   │  HTTPS + WebSocket over Tailscale (private network)
   │  FCM push for notifications
   ▼
MacBook (dedicated macOS user "agent")
   relayd (Node/TypeScript daemon, LaunchAgent)
    ├─ REST + WebSocket API (Fastify)
    ├─ Agent runner (Claude Agent SDK, one query per task)
    ├─ Git service (one worktree + branch per task)
    ├─ Build service (flutter build apk → Firebase CLI upload)
    ├─ SQLite (tasks, events, approvals, builds, devices)
    └─ Notifier (firebase-admin → FCM)
```

### Components

| Component | Responsibility |
|-----------|----------------|
| **Flutter app** (`/app`) | UI: projects, task stream, approvals, diff/code viewer, builds, settings |
| **Daemon** (`/daemon`) | Runs Claude Code via Agent SDK, manages git worktrees, builds, notifications, API |
| **Docs** (`/docs`) | Project description, sprint plan, roadmap |

## 8. Key design decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Daemon language | TypeScript (Node LTS) | Agent SDK is first-class in TypeScript; Firebase tooling is Node-native |
| Driving Claude Code | Claude Agent SDK `query()` | Gives cancel, resume, permission callback (`canUseTool`), and streaming |
| Task isolation | One git worktree and branch (`claude/<slug>`) per task | Parallel tasks, trivial discard, clean diff base |
| Event delivery | Every event stored in SQLite with a sequence number, then streamed | Phone can disconnect and replay missed events with `since=<seq>` |
| Approvals | Parked `canUseTool` promise, resolved from the phone | Agent keeps waiting while the phone is offline |
| Remote access | Tailscale, daemon bound to Tailscale interface or localhost behind `tailscale serve` | No public exposure, end-to-end encrypted |
| App-to-daemon auth | Per-device bearer token (QR pairing), hash stored on Mac, revocable | Simple and strong enough for one user |
| State management (app) | Riverpod | Good fit for stream-heavy UI |
| Build and upload (Android) | `flutter build apk --release`, then `firebase appdistribution:distribute` with a service account | Simple, no extra tooling |
| Release notes | Ask the same Claude session for tester-facing notes | Context is already loaded |

## 9. API surface (v1)

| Method and path | Purpose |
|---|---|
| `GET /projects`, `POST /projects` | List or register repos (allowlisted paths only) |
| `POST /projects/:id/tasks` | Create worktree and start a task |
| `POST /tasks/:id/messages` | Follow-up prompt on the same session |
| `POST /tasks/:id/cancel` | Interrupt a running task |
| `POST /tasks/:id/permissions/:toolUseId` | Allow or deny a pending tool call |
| `GET /tasks/:id/diff/summary`, `GET /tasks/:id/diff?path=` | Changed files, then one file's patch |
| `GET /tasks/:id/files?path=` | Read file contents |
| `POST /tasks/:id/commit`, `/push`, `/discard` | Git actions |
| `POST /builds`, `GET /builds/:id` | Queue and track an Android build |
| `POST /devices` | Register a phone (FCM token, name) |
| `WS /tasks/:id/stream?since=<seq>` | Event stream with replay |

## 10. Security requirements

1. Daemon never listens on a public interface.
2. Agent runs as a dedicated **non-admin** macOS user that owns only `~/workspaces`.
3. No production credentials, personal SSH keys, or browser profiles on that user.
4. Claude Code sandbox on (filesystem and network). Network allowlist: pub.dev, GitHub, Google Maven, Firebase.
5. Permission rules: auto-allow edits inside the worktree and `flutter analyze`, `flutter test`, `dart format`, read-only git. Everything else needs phone approval. Deny `sudo`, `rm -rf`, `curl | sh`, keychain commands, and `git push` by the agent (the daemon pushes).
6. `bypassPermissions` mode is never used.
7. Secrets (API key, Firebase service account, tokens) live in the agent user's Keychain or a `0600` env file, outside any repo Claude can read.
8. Sensitive actions in the app (push, build and distribute, "always allow") require biometric confirmation.
9. GitHub access via a fine-grained token scoped to specific repos; `main` protected so only `claude/*` branches can be pushed.

## 11. Operational requirements (MacBook)

- Lid open, plugged in, screen brightness at zero, or an external display for closed-lid use.
- Sleep disabled (`pmset`), plus `caffeinate -i` inside long jobs.
- Charge limit enabled to protect the battery.
- Daemon runs as a **LaunchAgent** (not a LaunchDaemon) with `KeepAlive`.
- External uptime ping so an outage alerts the owner.
- FileVault decision: on (safer; Mac waits at unlock screen after a power cut) or off with auto-login (unattended, but less secure).

## 12. Success criteria (MVP)

- From the phone on mobile data (via Tailscale), start a task, see streamed output, approve one command, and see the result.
- Review all changed files and their diffs, then commit and push a branch.
- One tap produces an APK in Firebase App Distribution with release notes within 10 minutes.
- A task survives the phone going offline for 30 minutes and the app replays all events on reconnect.
- No port is reachable from the public internet.

## 13. Risks

| Risk | Mitigation |
|------|------------|
| Anthropic credential or billing rules change again | Use API key or bundled credits; keep Remote Control as a fallback |
| Rate limits stall tasks | Surface limit errors in the app; cap concurrency to 1-2 tasks |
| Agent damages repo or leaks secrets | Worktrees, branch protection, sandbox, dedicated user |
| MacBook sleeps or runs out of battery | `pmset`, plugged in, charge limit, uptime alert |
| Large diffs or logs freeze the app | Paginate per file, virtualized lists, size caps (about 3,000 lines or 500 KB per file) |
| Android build fails on the Mac | Pin Flutter and Java versions; fall back to CI |

## 14. Open questions

1. Which Flutter repos will be registered first?
2. Which tester groups exist in Firebase App Distribution?
3. Does the Team plan's bundled API credit cover the daemon's usage, or is a separate API key needed? (Check the Team admin console.)
4. Is Remote Control enabled for the Team account? (Admin setting may apply.)
5. FileVault on or off?
