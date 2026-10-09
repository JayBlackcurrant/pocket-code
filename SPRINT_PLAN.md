# Sprint Plan

> Place at `docs/SPRINT_PLAN.md`.
> Assumes one developer, part-time, 1-week sprints. Total: about 3.5-4 weeks.
> Task IDs are stable so Claude Code and commits can reference them (for example `feat(daemon): S1-03 task runner`).

## Conventions

- **Definition of Done (every task):** code compiles, `analyze`/`lint`/`typecheck` clean, tests added or updated and passing, no secrets in code, docs updated if behavior changed.
- **Priority:** P0 = blocks the sprint goal, P1 = should ship, P2 = nice to have.
- **Estimates:** S = under half a day, M = about a day, L = 2+ days.

---

## Sprint 0: Mac and pipeline setup (2-3 days)

**Goal:** the Mac is safe, reachable, and can build and upload an APK by script, before any app code.

| ID | Task | Pri | Size | Acceptance criteria |
|----|------|-----|------|---------------------|
| S0-01 | Create dedicated non-admin macOS user `agent`; install Flutter, Android SDK, Java, Node LTS, `gh`, `firebase-tools`, Claude Code CLI | P0 | M | `flutter doctor` clean as `agent` |
| S0-02 | Power setup: no sleep (`pmset`), charge limit, lid-open plan, decide FileVault | P0 | S | Mac stays reachable 24h with display off |
| S0-03 | Install Tailscale (Standalone) on Mac and phone; write ACL so only the phone reaches the Mac | P0 | S | Phone reaches Mac by MagicDNS name; Mac has no public ports |
| S0-04 | Create Firebase project, Android app, tester group, service account for App Distribution | P0 | S | Service account can upload a test APK |
| S0-05 | Write `scripts/distribute.sh`: build APK, upload via Firebase CLI with release notes file | P0 | M | One command produces a release visible to testers |
| S0-06 | Try Anthropic Remote Control for a day; record what is missing | P1 | S | Written gap list in `docs/REMOTE_CONTROL_GAPS.md` |
| S0-07 | Confirm how the Team plan's API credits can be used (or create an API key with a spend limit) | P0 | S | Daemon credential decision recorded |
| S0-08 | Create monorepo with `/app`, `/daemon`, `/docs`, root `CLAUDE.md` | P0 | S | Repo pushed, CI-free for now |

**Sprint exit:** `scripts/distribute.sh` works over SSH as `agent`, and the phone can reach the Mac over Tailscale.

---

## Sprint 1: Daemon core and app shell

**Goal:** start a task from the phone and watch Claude's output stream live.

| ID | Task | Pri | Size | Acceptance criteria |
|----|------|-----|------|---------------------|
| S1-01 | Daemon scaffold: Fastify, TypeScript strict, SQLite, config loader, `/healthz` | P0 | M | Starts, passes health check, bound to allowed interface only |
| S1-02 | Device pairing: QR code on Mac, bearer token issued, hash stored, auth middleware | P0 | M | Unpaired requests get 401; token revocable |
| S1-03 | Project registry: register allowlisted repo paths | P0 | S | Paths outside allowlist rejected |
| S1-04 | Git service: create worktree and branch `claude/<slug>`, remove worktree | P0 | M | Parallel tasks do not collide |
| S1-05 | Agent runner: Agent SDK `query()` with `cwd` = worktree, stream events to SQLite with `seq` | P0 | L | Events stored in order, task result stored with session id and cost |
| S1-06 | WebSocket stream with `since=<seq>` replay | P0 | M | Kill and reconnect client, no events lost |
| S1-07 | Cancel endpoint using SDK `interrupt()` | P0 | S | Running task stops within seconds |
| S1-08 | Flutter shell: Riverpod, go_router, secure storage, pairing screen (QR scan) | P0 | M | App pairs with the Mac |
| S1-09 | Flutter: project list and "new task" screen | P1 | S | Task created from phone |
| S1-10 | Flutter: task stream screen (text deltas, basic tool-call cards, stop button) | P0 | L | Live output visible; reconnect replays |

**Sprint exit:** on mobile data via Tailscale, a task runs and streams to the phone.

---

## Sprint 2: Approvals and diff review

**Goal:** safely approve actions and review everything Claude changed.

| ID | Task | Pri | Size | Acceptance criteria |
|----|------|-----|------|---------------------|
| S2-01 | `canUseTool` bridge: park pending permission, store in SQLite, expose approve/deny endpoint | P0 | L | Agent waits while phone is offline, resumes on decision |
| S2-02 | Permission rules: allow list, deny list, per-task mode (`acceptEdits` default); sandbox on | P0 | M | Denied commands never run; verified by test |
| S2-03 | Approval timeout policy (deny with "user unavailable; stop and summarize" after N hours) | P1 | S | Runs do not hang forever |
| S2-04 | Flutter: approval cards (Allow once / Always / Deny with reason) | P0 | M | Decision reaches the daemon and agent continues |
| S2-05 | Diff endpoints: summary (`numstat`), per-file patch, untracked and renamed files, binary detection, size caps | P0 | M | 3,000-line file handled without crash |
| S2-06 | File reader endpoint (read-only, path-safe) | P1 | S | No path traversal outside worktree |
| S2-07 | Flutter: review screen with file list, +/- counts, unified/stacked diff (`flutter_diff_viewer` or custom) | P0 | L | Smooth scrolling on a large diff |
| S2-08 | Flutter: code viewer with syntax highlighting (chunked for large files) | P1 | M | Dart and YAML files readable |
| S2-09 | Git actions: commit (Claude-written message), revert file, discard task, push branch | P0 | M | Branch visible on GitHub; protected `main` untouched |

**Sprint exit:** approve a command from the phone, review diffs, commit and push a branch.

---

## Sprint 3: Build, distribute, notify

**Goal:** one tap from reviewed code to an APK in testers' hands.

| ID | Task | Pri | Size | Acceptance criteria |
|----|------|-----|------|---------------------|
| S3-01 | Build service: queue, `flutter pub get`, `flutter build apk --release`, log streaming | P0 | L | Build log visible live; one build at a time |
| S3-02 | Upload step: Firebase CLI with service account, tester groups, release notes file | P0 | M | Release appears in Firebase with notes |
| S3-03 | Release notes generation: ask the same session for tester-facing notes (max 8 bullets) | P1 | S | Notes editable in app before upload |
| S3-04 | Build job states and failure handling (clear error, retry) | P0 | M | Failed build shows reason and last log lines |
| S3-05 | FCM notifications: approval needed, task done (with diff stats), build ready, failure | P0 | M | Notification arrives with Tailscale off |
| S3-06 | Flutter: builds screen (group picker, notes editor, progress, Firebase link) | P0 | M | End-to-end build from phone |
| S3-07 | Biometric gate (`local_auth`) for push, build, and "always allow" | P1 | S | Sensitive actions blocked without biometric |
| S3-08 | `caffeinate -i` wrapper around long jobs | P1 | S | No sleep during a 15-minute build |

**Sprint exit:** end-to-end demo: prompt, review, commit, build, tester receives APK.

---

## Sprint 4: Hardening (3-4 days)

**Goal:** safe to leave running unattended.

| ID | Task | Pri | Size | Acceptance criteria |
|----|------|-----|------|---------------------|
| S4-01 | LaunchAgent plist with `KeepAlive`; restart test | P0 | S | Daemon returns after kill and after reboot |
| S4-02 | Crash recovery: mark interrupted tasks failed, offer Resume using stored session id | P0 | M | Resume continues the same session |
| S4-03 | Log redaction (tokens, keys) and log rotation | P0 | S | No secrets in logs (grep test) |
| S4-04 | External uptime monitor and alert | P1 | S | Alert received when Mac is unplugged |
| S4-05 | Security review checklist (see `CLAUDE.md`), network allowlist check, token revoke test | P0 | M | All items pass |
| S4-06 | Concurrency cap (max 2 tasks), cost per task shown in app | P1 | S | Third task queues |
| S4-07 | README: setup, recovery steps, how to rotate keys | P1 | S | A fresh setup can follow it |

**Sprint exit:** one week of real use without manual restarts.

---

## Backlog (not scheduled)

- Switch builds to CI (GitHub Actions) when the Mac is down.
- Multiple repos dashboard with status badges.
- Voice prompts.
- iOS builds and TestFlight.
- Inline "ask about this line" on diffs.
- Local-network fallback without Tailscale.

## Risks to watch each sprint

1. Anthropic credential or billing rule changes: re-read the support article at the start of each sprint.
2. Rate limits during testing: use a cheaper model by default.
3. Scope creep into an editor: the viewer stays read-only.
