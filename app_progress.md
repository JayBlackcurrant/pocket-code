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
| Approvals UI (S2-04) | ⬜ not started |
| Diff review + code viewer (S2-07, S2-08) | ⬜ not started |
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
- [ ] **S2-04** Approval cards (Allow once / Always / Deny with reason)
- [ ] **S2-07** Review screen (file list, +/- counts, unified/stacked diff; smooth on large diffs)
- [ ] **S2-08** Code viewer with syntax highlighting (chunked for large files)
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
