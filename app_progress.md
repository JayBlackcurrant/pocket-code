# App — progress log

> **Cross-device progress log for the Flutter app side of PocketCode (`/app`).**
> Partner file: [`agent_mac.md`](agent_mac.md) (Mac / daemon side).
> Both Claude Code instances read **both** files at the start of every session so the two
> devices stay in sync. See `CLAUDE.md` → "Progress tracking".
>
> **Conventions:** newest entry on top of the Log. Keep secrets OUT — no device tokens or
> pairing codes. The app stores its token in `flutter_secure_storage` only.

**Last updated:** 2026-10-15 — **S5-10 swipeable Logs | Code tabs** in `RunPage` (Code lists the task's changed files → diff/code viewer; control bar stays persistent). **Feature 1 (live run) is code-complete** (daemon S5-01…07 + app S5-08…11). analyze clean, **54 tests**, build bundle OK. ⚠️ not yet run end-to-end on a real phone. Earlier today: S5-09 run screen; S5-08 data layer.

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
| Builds screen (S3-06) | ✅ done — Build & ship screen: start build, live log (WS), editable AI release notes, group field, upload, Firebase link, retry |
| Biometric gate (S3-07) | ✅ done — `local_auth` gate on push, build/retry, upload (distribute), and "always allow"; fails closed |
| Notifications inbox (S3-05) | ✅ done — global keepAlive WS inbox + unread badge; in-app only (daemon-driven, no external push) |
| Live Run data layer (S5-08) | ✅ done — `src/run/`: `RunRow` + `DeviceDiscovery` models, pure `run_feed` (event→line + status reducers + debugUri), `RunStream` (WS `/runs/:id/stream?since=`, replay+reconnect), `RunActions` (devices/start/reload/restart/stop/activeForTask). |
| Live Run screen (S5-09/10/11) | ✅ done — `RunPage` (route `/tasks/:taskId/run`): auto-detects the phone's Tailscale IP (`tailnet.dart`, 100.64/10) → `GET /devices` cascade → **Run**; **swipeable Logs \| Code tabs** (Code = task's changed files → diff/code viewer) with a persistent control bar **Reload / Restart / Stop**; status + **link-quality** chip (direct/relay), **re-arm card** when `reArmNeeded`, manual host fallback, resume an active run on open, "switch to app" hint. Task page gained a **Run on phone** action. Feature 1 code-complete. |

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
- [x] **S3-06** Builds screen (group field, notes editor, live progress, Firebase link, retry)
- [x] **S3-07** Biometric gate (`local_auth`) for push / build / "always allow"

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

### 2026-10-15 — S5-10 swipeable Logs | Code tabs in the run screen
Finishes the app side of Feature 1. The live view's main area is now a `TabBar`/`TabBarView`
(**Logs** | **Code**) with the control bar persistent below and the status/quality header above —
"slide to see code" without leaving the run.
- **Logs tab:** the existing virtualized live log.
- **Code tab:** read-only — reuses `diffSummaryProvider(taskId)` to list the task's changed files
  (+/- counts, binary flag), pull-to-refresh, tap → `DiffFileRoute` (existing diff/code viewer).
  Manual in-app editing stays Phase 2 (S5-12).
- `SingleTickerProviderStateMixin` + a 2-tab `TabController` on the run page.
- **Tested:** `flutter analyze` clean, `flutter test` **54/54**, `flutter build bundle` OK.
- **Feature 1 is code-complete** (daemon S5-01…07, app S5-08…11). The one thing left before trusting
  it: a real end-to-end on the armed phone — nothing has driven real `adb`/`flutter run` yet.

### 2026-10-15 — S5-09 run screen (RunPage) — + task entry, resume, re-arm (S5-10/11)
The visible payoff: drive `flutter run` on the phone from PocketCode. Route `/tasks/:taskId/run`.
- **Device discovery:** on open, `tailnet.dart` `detectTailnetHost()` scans local interfaces for a
  100.64/10 (Tailscale) IPv4 and passes it to `GET /projects/:id/devices`. Falls back to a manual
  host `TextField` when none is found (ColorOS may hide the interface). `isTailnetIpv4` is pure +
  tested.
- **Setup view:** device card (name/serial + link-quality chip) with **Run**; a **re-arm card**
  (S5-11) when the cascade reports `reArmNeeded` (adb not reachable — Wireless debugging ON, or USB
  `adb tcpip 5555`); a re-check button; error + manual entry.
- **Live view:** header with a status chip (starting/running/reloading/stopped/failed) + link-quality
  + reconnecting indicator; virtualized live log (`ListView.builder`, colored by `RunLineKind`,
  auto-scroll via a `ref.listen` on line count); control bar **Reload / Restart / Stop** (reload
  result snackbars the flutter "Reloaded in …ms"); "Start another run" after it stops; an app-bar
  **switch-to-app** hint (the app runs on the phone — use the app switcher).
- **Entry + resume (S5-10):** task page app-bar gained **Run on phone** (`play_circle_outline`) →
  `RunRoute`; on open `RunPage` adopts an already-active run for the task (`activeForTask`).
- **Tested:** `flutter analyze` clean, `flutter test` **54/54** (+3 `isTailnetIpv4`),
  `flutter build bundle` OK, routes regenerated.
- **Not done (S5-10):** swipeable Logs | Code | Controls panels (the live log + controls are on one
  screen for now; Code viewing is via the existing review/code pages). A real device run is still
  unexercised end-to-end (needs the armed phone).

### 2026-10-15 — S5-08 live-run app data layer (`src/run/`)
App side of Feature 1 (live run), mirroring `src/builds/`. Data layer + providers only — no UI yet
(that's S5-09). The daemon side (S5-01…07) is complete; these consume its run routes/WS.
- **Models:** `models/run_row.dart` (`RunRow` ← POST/GET `/runs`: id, projectId, status
  starting|running|reloading|stopped|failed, branch, taskId?, deviceSerial?, debugPort?, error? +
  status helpers); `models/device.dart` (`DeviceDiscovery` + `RunDevice` ← `GET /projects/:id/devices`:
  host, port?, connected, reArmNeeded, quality direct|relay|unknown, devices[], `primary`);
  `models/run_stream_state.dart` (`RunStreamState`).
- **`run_feed.dart` (pure):** `mapRunEvent` (run.log→log, started→success, reload/restart/autoreload→
  reload, reloaded/restarted→success with flutter's "Reloaded in …ms" message, *_failed→error,
  progress→lifecycle (dropped when empty), stopping/stopped→lifecycle, error→error; created/debugPort
  →none), `runStatusFromEvent`, `debugUriFromEvent`.
- **`providers/run_stream.dart`:** `RunStream` — WS `/runs/:id/stream?since=`, replay-then-tail +
  2s reconnect from last seq, 2000-line cap. Verbatim shape of `BuildStream`.
- **`providers/run_actions.dart`:** `RunActions` (codegen) — `devices(projectId, host)`,
  `start(projectId, {deviceSerial, taskId?, flavor?})`, `reload`/`restart` (→`RunControlResult`),
  `stop`, `activeForTask`.
- **Tested:** `flutter analyze` clean, `flutter test` **51/51** (+10: run_feed mapper/status/debugUri,
  RunRow + DeviceDiscovery parsing incl. the re-arm-needed case). build_runner regenerated.
- **Next:** S5-09 run screen (device picker, control bar Run/Stop/Reload/Restart, status +
  connection quality, virtualized live log, "Open app"); S5-10 task-page entry + swipeable panels;
  S5-11 "phone unreachable → Reconnect". The app will need the phone's own tailnet IP for `devices`
  (read a 100.64/10 interface via `NetworkInterface.list`).

### 2026-10-11 — build-after-continue fix + hide cost
- **Fix "stuck on the previous build":** the Build & ship screen auto-adopted the *latest*
  build for the task — including a finished one — so after a build you couldn't start a new one
  (it kept showing the old build/APK). Now it only auto-adopts a build that's **still in
  progress**; a finished build shows the Start view. Added a **"New build" (+)** app-bar action
  to leave a shown build and start another. So: continue → review → commit → **New build** works.
- **Hide cost:** removed the `$cost` from the task list subtitle and the `task.completed` feed
  item. `costUsd` is still parsed/stored (kept server-side), just not displayed.
- **Tested:** analyze clean, 41 tests, build bundle compiles. App-only (no daemon change).

### 2026-10-11 — project screen: recent tasks tab + model picker (UX #1)
- Project screen reshaped into **Tasks | Files** tabs (SegmentedButton). **Tasks** is the
  default: recent tasks from new `GET /projects/:id/tasks` (`projectTasks` provider), newest
  first, status chip + branch + cost, tap → `TaskRoute`, pull-to-refresh. **Files** holds the
  existing browser (breadcrumb + tree). Composer stays at the bottom on both.
- **Model picker** folded into the composer (Default / Opus / Sonnet / Haiku) → passed as
  `model` to `POST /projects/:id/tasks` (daemon already accepted it). On send, the task list
  refreshes so the new task shows on return; prompt + attachments clear.
- Daemon: `TaskStore.listForProject` (rowid tie-break) + `GET /projects/:id/tasks`.
- **Tested:** daemon typecheck clean, 171 tests (+2 listForProject); app analyze clean, 41
  tests, build bundle compiles. (On hold still: continue-on-branch, mode/branch pickers.)

### 2026-10-11 — review → commit → build gating (app)
Build is now only offered after the task's changes are committed.
- New `review/providers/review_status.dart` → `GET /tasks/:id/review-status`
  (`clean`, `committedAhead`, `buildReady`).
- **Task page:** when a task finishes (`done`), a green banner nudges *"review the changes and
  commit, then build"* with a **Review** button.
- **Builds screen:** the start view now branches on review-status — **Review & commit first**
  (uncommitted changes), **Nothing committed yet** (clean but 0 ahead), or the normal codegen
  toggle + **Start build** (buildReady). The gate card's button opens Review and re-checks on
  return.
- **Review screen:** commit/revert now invalidates `taskReviewStatus` so the build unlocks
  immediately after committing.
- Daemon backstops with a 409 if a dirty build is somehow requested (see agent_mac.md).
- **Tested:** `analyze` clean, `flutter test` 41/41, `flutter build bundle` compiles.

### 2026-10-10 — S3-05 notifications inbox (self-contained)
- New `src/notifications/` feature consuming the daemon's self-contained notifications
  (no external push — see `agent_mac.md`). `NotificationsStream` (**keepAlive**) loads recent
  via `GET /notifications`, then live-tails **WS `/notifications/stream?since=`** with reconnect;
  tracks unread. Home gets a **bell + unread Badge**; tapping opens `NotificationsPage`
  (route `/notifications`), which marks all read (`POST /notifications/read`) on open and
  **deep-links** each item to its task (`TaskRoute`).
- New files: `notifications/models/app_notification.dart`, `models/notifications_state.dart`,
  `providers/notifications_stream.dart`, `ui/notifications_page.dart`; route + home bell.
- **⚠️ In-app only:** this surfaces notifications when the app is open/connected over Tailscale
  and catches up on reconnect — it does **not** show OS tray notifications when the app is
  closed / off-tailnet (that needs an external push relay, deliberately out of scope per the
  "no extra service" decision). No `flutter_local_notifications` dep added.
- **Tested:** `analyze` clean, `flutter test` **41/41** (3 new AppNotification model cases),
  `flutter build bundle` compiles. The live WS/inbox flow isn't widget-tested; verify on device.

### 2026-10-10 — S3-07 biometric gate for sensitive actions
- New `src/security/`: `BiometricGate` wraps a `LocalAuthenticator` seam (default
  `PlatformAuthenticator` over **`local_auth`**; `biometricOnly:false` so device PIN/pattern
  is an accepted fallback). **Fails closed** — if the device can't authenticate, or the
  prompt is declined/throws, the action is blocked. `ensureBiometric(ref, context, reason)`
  helper gates a call and snackbars on failure. Gate exposed as `biometricGateProvider`
  (overridable in tests).
- **Gated (CLAUDE.md "push, build and distribute, always allow"):** push (review page),
  **start build** + **retry** + **upload/distribute** (builds page), and **"Always allow"**
  on an approval card (task page). Each aborts if the gate isn't passed.
- **New dependency `local_auth: 2.3.0`** — sanctioned by S3-07, which names it. Alternative
  considered: hand-rolled platform channels to BiometricPrompt/LAContext — strictly more
  native code to maintain for the same result. Native prerequisites done: `MainActivity` now
  extends **`FlutterFragmentActivity`** (required by local_auth) and `AndroidManifest` adds
  `USE_BIOMETRIC`. (iOS would need `NSFaceIDUsageDescription` when an iOS build is added.)
- **Tested:** `analyze` clean, `flutter test` **38/38** (5 new gate cases: success, declined,
  unavailable→blocked, isSupported-throws→blocked, prompt-throws→blocked),
  `flutter build bundle` compiles. **Not verified:** the real biometric prompt on device
  (needs an APK build on a phone with a lock set) and the native `FlutterFragmentActivity`
  change (not exercised by `build bundle`) — confirm on the first real device build.

### 2026-10-10 — S3-06 builds screen (Build & ship)
- New `src/builds/` feature driving the daemon's S3-01…04 pipeline from the phone. Entry: a
  **rocket** action on the task page → `BuildsRoute` (`/tasks/:taskId/build`). The screen
  derives the project from `taskDetail`, then:
  - **Start build** (codegen toggle) → `POST /projects/:id/builds {taskId, runCodegen}`.
  - **Live log** over `WS /builds/:id/stream?since=` (`BuildStream`, replay + reconnect, same
    contract as the task stream), rendered as monospace lines with **step markers** and
    colored lifecycle/success/error lines. Status chip (queued/running/succeeded/failed/
    uploading/uploaded). Auto-scrolls.
  - On success: **editable release notes** prefilled from `GET /tasks/:id/release-notes`
    (shows "from Claude" vs "from diff"), a **Regenerate** button, a **tester-groups** field
    (comma-separated; empty = project default), and **Upload to testers** →
    `POST /builds/:id/upload`. Upload progress streams into the same log.
  - On upload done: the **Firebase release link** with a Copy button.
  - On failure/cancel: **Retry** → `POST /builds/:id/retry` (new build id).
  - On open, resumes the latest build for the task if one exists.
- New files: `builds/models/build_row.dart`, `builds/build_feed.dart` (pure event→line +
  status reducers), `builds/models/build_stream_state.dart`, `builds/providers/build_stream.dart`,
  `builds/providers/build_actions.dart`, `builds/ui/builds_page.dart`; route + task-page entry.
- **Deferred to S3-07:** upload/retry are **not biometric-gated** yet (CLAUDE.md wants a
  biometric check on build & distribute). Marked with a NOTE in `_upload`. Group *picker* is a
  text field for now (daemon doesn't expose configured groups); fine until Firebase is set up.
- **Tested:** `analyze` clean, `flutter test` **33/33** (13 new build_feed cases),
  `flutter build bundle` compiles. The live build/upload flow isn't widget-tested; verify on
  device once the agent Mac serves S3-01…04 (and Firebase staging is provisioned for upload).

### 2026-10-10 — @path autocomplete in the prompt box
- Typing `@` in the project composer shows a live file-suggestion panel (just above the input)
  from `GET /projects/:id/search?q=` (provider `projectSearch`). Selecting a suggestion attaches
  the file (chip) and removes the `@token` from the text. Pure `parseActiveMention` finds the
  active mention from text+cursor (mention starts at `@` at start/after whitespace; whitespace
  ends it). New: `project/mention.dart`, `projectSearch` provider.
- **Tested:** `analyze` clean, `flutter test` 25/25 (5 mention-parser cases). Overlay UX not
  widget-tested; verify on device.
- Daemon: `GET /projects/:id/search` (agent_mac.md) — agent Mac must pull+restart.

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
