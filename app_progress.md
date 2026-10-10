# App — progress log

> **Cross-device progress log for the Flutter app side of PocketCode (`/app`).**
> Partner file: [`agent_mac.md`](agent_mac.md) (Mac / daemon side).
> Both Claude Code instances read **both** files at the start of every session so the two
> devices stay in sync. See `CLAUDE.md` → "Progress tracking".
>
> **Conventions:** newest entry on top of the Log. Keep secrets OUT — no device tokens or
> pairing codes. The app stores its token in `flutter_secure_storage` only.

**Last updated:** 2026-10-10 — by Claude Code on the dev machine (app side)

---

## Status snapshot

| Area | State |
|------|-------|
| App scaffold (`/app`: Riverpod 3 codegen, **AutoRoute**, secure storage) | ✅ done — mirrors `hedged-core-app` architecture; `flutter analyze` clean, 10 tests pass |
| Pairing (S1-08: QR scan → token) | ✅ works — phone paired & connected to the daemon (2026-10-09, user-confirmed) |
| Project list / new task (S1-09) | ✅ implemented — tap active project → prompt → `POST /projects/:id/tasks` |
| Task stream screen (S1-10) | ✅ implemented — `WS …/stream?since=<seq>`, replay + reconnect, tool-call cards, Stop button |
| Approvals UI (S2-04) | ✅ done — approval cards (Allow once / Always / Deny+reason) in the task stream |
| Diff review (S2-07) | ✅ done — file list (+/- counts, generated collapsed) → per-file unified diff |
| Code viewer (S2-08) | ✅ done — full-file viewer, Dart/YAML syntax highlighting, line numbers |
| Git actions (S2-09 app) | ✅ done — commit/push/discard menu + long-press revert on review screen |
| Builds screen + biometric gate (S3-06, S3-07) | ⬜ not started |

> **Correction vs the Mac-seeded version:** the app uses **AutoRoute**, not go_router (owner's
> instruction; `CLAUDE.md` repo-layout line updated accordingly). S1-09 and S1-10 are **built
> and passing**, not "unverified". The one thing still unproven on a real device is a full
> **live agent-task stream** (needs a real task run on the agent Mac).

---

## App task checklist (from `SPRINT_PLAN.md`)

- [x] **S1-08** Flutter shell: Riverpod, **AutoRoute**, secure storage, pairing screen (QR scan) — pairing confirmed live 2026-10-09
- [x] **S1-09** Project list + "new task" screen
- [x] **S1-10** Task stream screen (text + tool-call cards, stop button; reconnect replays via `since=<seq>`)
- [x] **S2-04** Approval cards (Allow once / Always / Deny with reason)
- [x] **S2-07** Review screen (file list, +/- counts, unified diff; smooth on large diffs)
- [x] **S2-08** Code viewer with syntax highlighting (chunked for large files)
- [ ] **S3-06** Builds screen (group picker, notes editor, progress, Firebase link)
- [ ] **S3-07** Biometric gate (`local_auth`) for push / build / "always allow"

---

## Architecture (as built, mirrors hedged)

- Riverpod 3 codegen (`@riverpod` / `@Riverpod(keepAlive:true)`), **AutoRoute** (router is a
  keepAlive provider taking `Ref`; guards), feature-first `src/<feature>/{ui,providers,models}`,
  `core/` infra, `context.colors`/`context.text` ThemeExtensions, `apiProvider` over Dio with a
  per-request bearer interceptor, `.guard()` → `AppException`.
- **Difference from hedged:** the daemon base URL is runtime (from the scanned QR), not an env
  constant — held in `pairingProvider` (secure storage).
- Deps added beyond hedged: `mobile_scanner` (QR), `web_socket_channel` (task stream).

## Reminders for the app side (from `CLAUDE.md`)

- Token in `flutter_secure_storage` only. Network: `dio` (REST) + `web_socket_channel` (streams);
  on reconnect request `since=<last seq>`.
- Virtualize large content (`ListView.builder`), size-capped. Collapse generated files in diffs:
  `*.g.dart`, `*.freezed.dart`, `pubspec.lock`.
- Sensitive actions (push, build & distribute, "always allow") require a biometric check.
- Notifications must never contain code or secrets. Follow `app/analysis_options.yaml`.
- The daemon's base URL for the phone is the Tailscale MagicDNS HTTPS URL (from the pairing QR).

---

## Next up (App side)

- [ ] Live-verify a full **agent-task stream** on the device (needs a real task run on the Mac).
- [ ] **S2-04** approval cards — pairs with the daemon's S2-01 `canUseTool` bridge.
- [ ] Token-level streaming (parse `agent.stream_event` deltas) — currently renders per message.

---

## Log

### 2026-10-10 — Project browser + attach-files prompt (new UX)
- Tapping a project now opens `ProjectPage` (route `/projects/:projectId/browse`) instead of
  the old new-task screen: a **file browser** (directory navigator via `GET /projects/:id/tree`,
  tap folder to descend, up button, tap file → `ProjectFilePage` read-only viewer) with a
  **composer at the bottom** — multiline prompt + **Send**, and **attach files** (tap the + on a
  file row → chips above the input). Send folds attachments into the prompt ("Please consider
  these files: …") and starts the task via the existing `newTaskController`, then opens the task
  stream.
- New `src/project/` feature (tree_entry model, projectTree/projectFile providers, project_page,
  project_file_page). Extracted a reusable `CodeView` widget (shared by the task code viewer and
  the project file viewer). Removed the old `new_task_page.dart` (superseded); home points to
  `ProjectRoute`.
- Daemon side: `GET /projects/:id/tree` + `GET /projects/:id/files` (see agent_mac.md) — agent
  Mac must pull+restart.
- **Tested:** `analyze` clean, `flutter test` 20/20. The browser/compose flow isn't widget-tested
  yet; verify on device.

### 2026-10-10 — S2-09 git actions (app)
- Review screen app-bar menu: **Commit…** (dialog prefilled with the daemon's suggested
  message, editable), **Push branch** (confirm → `POST /push`), **Discard task** (confirm →
  `POST /discard` → back to Home). **Long-press a file → Revert** (confirm → `POST /revert`).
  New provider `git_actions.dart` (suggestMessage/commit/revert/push/discard).
- Push/discard are confirm-gated for now; **biometric gate is S3-07** (CLAUDE.md requires it
  for push). Decisions hit the daemon's S2-09 endpoints; only `claude/*` is pushable.
- **Tested:** `analyze` clean, `flutter test` 20/20 (UI handlers not unit-tested; daemon git
  actions covered 97/97 on the daemon side).

### 2026-10-10 — S2-08 code viewer
- `CodeViewerPage` (route `/tasks/:taskId/file`) reads full file content via S2-06
  (`GET /tasks/:id/files?path=`, provider `fileContent`) and renders it with line numbers +
  **syntax highlighting**. Highlighter (`src/review/highlighter.dart`) is a dependency-free
  per-line tokenizer for **Dart** (keywords/types/strings/line+block comments with cross-line
  carry/numbers) and **YAML** (keys/comments/strings/numbers/bools); other extensions render
  plain. Spans are precomputed once, lines rendered via **`ListView.builder`** (chunked/smooth
  for large files). Binary + truncated handled. Entry point: "View full file" action on the
  per-file diff page.
- Chose a custom highlighter over a dep (whole-file highlighters don't virtualize per line).
- **Tested:** `analyze` clean, `flutter test` 20/20 (highlighter: dart kw/type/string/block
  comment carry, yaml key/comment/number; language detection).

### 2026-10-10 — S2-07 diff review screen
- New `src/review/` feature consuming S2-05 endpoints. `ReviewPage` (route
  `/tasks/:taskId/review`): file list from `GET /tasks/:id/diff/summary` with status badge +
  `+adds/-dels`; **generated files collapsed** by default (`.g.dart`/`.gr.dart`/`.freezed.dart`/
  `pubspec.lock`) under an ExpansionTile. Tap → `DiffFilePage` (`/tasks/:taskId/review/file`):
  per-file unified patch from `GET /tasks/:id/diff?path=`, rendered with a pure
  `classifyDiffLine` colorizer, **virtualized via `ListView.builder`** (smooth on large diffs),
  with binary + truncated handling. Entry point: a Review action on the task screen app bar.
- Custom renderer (no `flutter_diff_viewer` dep). Providers `diffSummary`/`fileDiff` (codegen).
- **Tested:** `analyze` clean, `flutter test` 16/16 (classifier + isGenerated). Smooth-scroll
  relies on ListView.builder; not yet profiled on a real device with a huge diff.

### 2026-10-10 — S2-04 approval cards
- Approval cards render in the task stream for parked tool calls, derived from the WS event
  fold (`agent.permission_request` adds; `agent.permission_decision`/`_timeout` removes) in
  `task_stream.dart` → `TaskStreamState.pending`. On a fresh open (`since=0`) the fold rebuilds
  the pending set, so reconnect/relaunch shows the right cards.
- Buttons: **Allow once** → POST decision `allow`; **Deny** → dialog for optional reason →
  `deny`; **Always** → client-side session auto-allow for that tool name (approves current +
  future requests automatically this session). New files: `models/pending_approval.dart`;
  card UI `_ApprovalCard` in `task_page.dart`; feed now shows permission request/decision/
  timeout/auto-denied (auto-allowed hidden as noise).
- **Decisions reach the daemon** via `POST /tasks/:id/permissions/:toolUseId` (the S2-01
  endpoint); the agent then resumes.
- **Tested:** `analyze` clean, `flutter test` 14/14 (feed mapping + PendingApproval.summary).
- **Notes / deferred:** "Always" is per-session client-side (no persisted daemon rule) and is
  **not yet biometric-gated** — CLAUDE.md wants a biometric check on "always allow"; that's
  **S3-07**. Needs the daemon running S2-01/02/03 (agent Mac) to exercise end-to-end.

### 2026-10-10 — logging interceptor + app-scoped launch config
- Added a colorized Dio **logging interceptor** mirroring hedged: `core/extension/log.dart`
  (`logInfo/logSuccess/logWarning/logError`) + `core/interceptors/logging_interceptor.dart`
  (request/response/error blocks). Wired into `dio_instance.dart`, **debug builds only**,
  after the auth interceptor; replaced dio's built-in `LogInterceptor`.
  - Deviations from reference: dropped hedged's `await Future.delayed(20ms)` per hook (needless
    latency); used `extends Interceptor` (consistent with `AuthInterceptor`) vs hedged's
    `implements InterceptorsWrapper`.
- Added `app/.vscode/launch.json` (PocketCode debug/profile/release, rooted at `app/`) and
  `app/.vscode/settings.json` (FVM SDK path) so `/app` can be opened/run standalone. The
  repo-root `.vscode/launch.json` (daemon + app + compound) still covers the whole monorepo.
- **Tested:** `dart format` + `flutter analyze` clean. (No codegen needed.) Logs only show in
  debug runs (`flutter run`), not `--release`.

### 2026-10-10 — app side taken over; corrected status; Sprint 1 app complete
- Took over `app_progress.md` from the Mac-seeded version and corrected it against `/app/lib`.
- **Built S1-08…S1-10** (this spans earlier sessions): pairing (QR + manual paste), project
  list → new task, and the live task stream (WS replay/reconnect, tool-call cards, Stop).
- Architecture mirrors `hedged-core-app` using **AutoRoute** (not go_router); `CLAUDE.md`
  repo-layout line updated to match.
- **Device-run fixes:** (1) `app_router.gr.dart` needed Flutter imported in `app_router.dart`
  (part file couldn't resolve `Key`/`Widget`) — fixed; verified with `flutter build bundle`.
  (2) `TaskStream.build()` read `state` before init → "uninitialized provider" crash; now
  defers `_connect()` to a `Future.microtask`.
- Added deps `mobile_scanner`, `web_socket_channel`; dropped `require_trailing_commas` lint
  (conflicts with the Dart 3.10 formatter).
- **Tested:** `flutter analyze` clean, `flutter test` 10/10, `flutter build bundle` compiles,
  and from a fresh clone: `pub get` + `build_runner` (30 outputs) + `analyze` all pass.
- **Not verified:** a full live agent-task stream on the device (pairing + projects list are
  confirmed live; a real task run is the remaining end-to-end check).

### 2026-10-09 — paired & connected (seeded from the Mac)
- The daemon Mac setup completed and the phone (`realme-11-pro-5g`) **paired and connected
  successfully** over Tailscale — so the app's pairing flow (S1-08) works end-to-end against a
  live daemon.
- This file was created from the Mac side as a starting point; app internals were **not**
  inspected there. Corrected on 2026-10-10 (above).
