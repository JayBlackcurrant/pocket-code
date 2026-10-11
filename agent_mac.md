# Agent Mac — progress log

> **Cross-device progress log for the Mac / daemon / infra side of PocketCode.**
> Partner file: [`app_progress.md`](app_progress.md) (Flutter app side).
> Both Claude Code instances read **both** files at the start of every session so the two
> devices stay in sync. See `CLAUDE.md` → "Progress tracking".
>
> **Conventions:** newest entry on top of the Log. Keep secrets OUT — no bearer/pairing
> codes, API keys, or tailnet/MagicDNS names (those live only in `daemon/env.sh`, git-ignored).

**Last updated:** 2026-10-11 — **tasks now run in the project checkout on a `claude/<slug>` branch (no worktrees)**, one at a time per project, with edit-path containment (branch `claude/in-place-task-branches`, 166 tests) — fixes the staging signing failure; earlier: codegen `dir:` for api/; keyless Tailscale-served APK link; Sprint 3 daemon complete; SDK 0.1.77→0.3.296

---

## Status snapshot

| Area | State |
|------|-------|
| Daemon Sprint 1 (S1-01…S1-07) | ✅ present & passing |
| Daemon Sprint 2 (S2-01/02/03/05/06/09) | ✅ pulled & running here; typecheck clean, **97/97 tests** |
| Daemon Sprint 3 (S3-01/02/03/04/05/08) | 🟡 **built on dev machine** (typecheck clean, 150 tests) — not yet pulled/run here; no real `flutter build` / Firebase upload / live session resume exercised. **Sprint 3 daemon complete.** |
| Notifications (S3-05) | ✅ self-contained — daemon derives notifications from task/build events; phone reads over tailnet (live + replay). ⚠️ no off-tailnet push (needs an external relay; see log) |
| Distribution method | ✅ **Tailscale-served APK link** (keyless; no Google service account) — branch `claude/tailscale-distribution`, typecheck clean + 161 tests. Daemon serves the APK over its own HTTPS and returns a signed, expiring `/builds/:id/apk?t=…` link. Replaces Firebase (that path kept, still optional). Trade-off: testers must be on the tailnet. |
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
- [ ] **Merge/push `claude/tailscale-distribution`** (Tailscale-served distribution) — committed locally here (`8e856ec`), not pushed. Then `git pull` + restart so the daemon serves download links.
- [ ] **App (dev side):** relabel 3 "Firebase" strings — `app/lib/src/builds/ui/builds_page.dart:474,477` ("Copy Firebase link" / console fallback) and `app/lib/src/builds/build_feed.dart:85` ("Uploading to Firebase…"). Cosmetic; the link already works.
- [ ] Optional: set `RELAYD_DOWNLOAD_SECRET` in `env.sh` so download links stay valid across daemon restarts (else a fresh per-process secret invalidates old links on restart).
- [ ] Full end-to-end (build→ship→install) still needs **Flutter/FVM on this Mac** to produce a real staging APK (not yet installed).
- [ ] **S4-01** — LaunchAgent plist with `KeepAlive` for real reboot/crash survival (deferred; user chose "leave as-is for now" on 2026-10-09). Keeps biting pairing: when the daemon is stopped/rebooted nothing restarts it.
- [ ] Confirm task worktrees land somewhere sensible (`RELAYD_WORKSPACES_DIR` is unset; verify a real task run creates a worktree inside the allowlist).
- [ ] **S4-05 hardening:** `permissionRules` `git push` deny regex misses `git -C <path> push` — tighten it.
- [ ] Confirm **S2-04 "Always allow"** behavior — no server-side rule persistence yet; check whether it re-asks on the next identical tool.
- [ ] `npm audit`: 6 vulns (3 moderate / 1 high / 2 critical) — triage before the hardening sprint (don't `--force` blindly).

---

## Log

### 2026-10-11 — build requires committed code (review → commit → build) — dev side
Enforce the flow: after a task, you review + commit, and only then can you build.
- `GitService.commitsAhead(repo, base, branch)` — count of committed, reviewable work.
- New `GET /tasks/:id/review-status` → `{ base, branch, clean, committedAhead, buildReady }`
  (`buildReady = clean && committedAhead > 0`). Drives the app's gate.
- **Build gate:** `POST /projects/:id/builds` with a `taskId` now returns **409 "Uncommitted
  changes — review and commit before building"** when the checkout is dirty (backstop; the app
  also hides the Start button until committed). Clean tree = the task's edits are committed.
- **Tested:** typecheck clean, **167 tests** (+1: commitsAhead + clean→dirty→committed around
  commitAll). **➡️ Action on this Mac:** `git pull` + restart to serve review-status + the gate.

### 2026-10-11 — tasks run in the project dir on a per-task branch (worktrees dropped) — this Mac
Branch `claude/in-place-task-branches` (`6916790`). Root cause of the staging build's
*"StagSign missing storeFile"*: tasks ran in `.worktrees/<id>`, which hold only tracked files, so
the gitignored `android/staging-key.properties` + keystores never reached them. Owner chose (over
the copy-in alternative) to run tasks **in place** in the project checkout for long-term simplicity.
- gitService: `createWorktree`→`createTaskBranch` (`checkout -b` in place, **requires a clean tree**),
  `removeWorktree`→`discardTaskBranch` (`reset --hard` + `clean -fd` + `checkout base` + `branch -D`),
  added `isClean`/`checkoutBranch`, removed worktreePath/ensureExcluded/listWorktrees.
- agentRunner: **one active task per project** (`ProjectBusyError`→409) replaces worktree isolation;
  **edit-path containment** in `canUseTool` denies Edit/Write/etc. whose path escapes the project dir.
- server: discard → `discardTaskBranch`; `POST /projects/:id/tasks` → 409 when busy. Other endpoints
  unchanged (a task's stored `worktree` is now just the project dir).
- buildService: builds run in the project dir and `checkout` the task's branch first (builds the right code).
- Docs updated: `CLAUDE.md` git rules, `PROJECT_DESCRIPTION.md` isolation + risk rows.
- **Tested:** typecheck clean; **166 tests** (branch-based git service incl. clean-tree + discard,
  one-at-a-time 409, edit-containment deny). **Not yet run live** on a real agent task/build — verify:
  start a task → `hedged-core-app` goes onto `claude/<slug>`; build → **staging signing succeeds**;
  discard → back to a clean `stag`; a 2nd concurrent task → 409.
- **Follow-up / cleanup:** 11 stale `.worktrees/*` dirs + old `claude/*` branches remain in
  `hedged-core-app` (one-time `git worktree remove` + `branch -D`). Branch not pushed.

### 2026-10-10 — codegen steps support a per-step working directory (`dir:`) — this Mac
On branch `claude/tailscale-distribution` (`18d1075`). A codegen step can now be `{ run, dir }`,
not just a bare string, so it runs in a worktree subdirectory. Needed because the first real build
only ran `build_runner` at the app root, not in the `api/` path-dependency package.
- The daemon runner is still **shell-free** (no `cd`/`&&`); the step just gets a different cwd,
  resolved with `safeResolveWithin` so a `../`/symlink escape fails the build cleanly.
- `projectManifest.ts`: `CodegenStepSchema = string | { run, dir? }` (backward compatible).
  `buildService.ts`: normalize each step, compute the step cwd, record `dir` on the `build.step` event.
  `hedged.yaml`: `fvm flutter pub get` → `build_runner` in `dir: api` → `build_runner` at root.
- **Tested:** typecheck clean, **163 tests** (2 new: runs-in-subdir asserts the api step's cwd;
  dir-escape fails the build). **Not verified on a real build yet** — `api/` may also need its own
  `fvm dart pub get` before `build_runner`; if the api step fails on unresolved packages, add a
  `{ run: "fvm flutter pub get", dir: api }` step (one line now that `dir:` exists).
- Requires a daemon **restart** to load the new manifest (config loads at startup; tsx watch only
  watches `src/`).

### 2026-10-10 — hedged codegen: skip dart-api-generator (backend not on this Mac) — dev side
First real build on the always-on Mac failed with the intended clear error: *"codegen requires
sibling checkout ../hedged-core-backend … which is missing"* — the backend repo isn't checked
out here, and hedged's `dart-api-generator.sh` also hardcodes a dev-Mac absolute path to
swagger.yaml (so cloning alone wouldn't fix it).
- **Decision (user):** skip `dart-api-generator.sh` for now; run only `fvm flutter pub get` +
  `fvm dart run build_runner build`. Safe because the `api/` package is **committed** in hedged
  (a `path: ./api` dep, 2035 files tracked) and `build_runner` only needs annotations — no
  backend. Removed `codegen.requiresSibling` from `hedged.yaml` so the build no longer fails fast.
- **Caveat:** the committed `api/` may lag the latest backend swagger until we wire the backend
  up. Follow-up: re-add `requiresSibling` + the generator step once the backend is available and
  the generator reads the backend path from the daemon (worktree-safe) instead of a hardcoded one.
- **Tested (dev):** daemon typecheck clean, 161 tests pass (config-only change). **➡️ Action on
  this Mac:** `git pull` + restart, then re-run the build (pub get + build_runner only).

### 2026-10-10 — replaced Firebase App Distribution with a keyless Tailscale-served link (this Mac)
User had no Firebase service-account key and wanted a keyless replacement with minimal change.
Planned (plan mode) and implemented on branch `claude/tailscale-distribution` (`8e856ec`):
- **Why keyless works here:** the daemon already holds the built APK (`build.artifact`) and is
  already on Tailscale HTTPS; the app already renders whatever `releaseUrl` arrives on the
  `build.upload_completed` event. So: serve the APK ourselves and hand back a link.
- **Added** `distribution.tailscaleServe { linkTtlMinutes }` to the manifest (additive; Firebase
  path kept, still optional). `distributionService` branches to a keyless path that skips the
  credential/Firebase/placeholder checks and builds a **signed, expiring** URL
  `${advertiseUrl}/builds/:id/apk?t=…`. New `downloadToken.ts` (HMAC via `auth/crypto`). New route
  `GET /builds/:id/apk` — **not bearer-authed** (a tester opens it in a browser), gated by the
  token; tailnet-only via `tailscale serve`. `RELAYD_DOWNLOAD_SECRET` optional (random if unset).
  `hedged.yaml` switched to `tailscaleServe`.
- **Tested:** typecheck clean; **161 tests** incl. new downloadToken unit tests, the tailscaleServe
  path (no credential needed, link verifies, nothing spawned), and the `/builds/:id/apk` route
  (200 valid / 403 bad-or-expired / 404 missing). Booted the daemon on the branch → `hedged` still
  `active`, `/healthz` ok (manifest schema change parses).
- **Not done / follow-ups:** branch not pushed; 3 cosmetic app "Firebase" strings (dev side);
  real build→install needs Flutter/FVM here. Trade-off vs Firebase: testers must be on the tailnet.
- **Decision (user):** "use the service which starts with the daemon and ends with it, no
  extra" → notifications are **daemon-only**, no Firebase/FCM/ntfy/Gotify, no app, no account.
  (No Firebase project was created — I can't, and it wasn't wanted for notifications. The
  separate S3-02 App-Distribution Firebase app is still unprovisioned and unrelated.)
- **How:** new `NotificationService` (`src/notify/`) **subscribes to the existing** task event
  stream (`runner.onEvent`) and build log (`buildLog.onEvent`) — the services themselves are
  untouched — and translates notification-worthy events into stored notifications
  (`notifications` table, monotonic seq) via pure, tested `notificationFeed` mappers. Build
  notifications resolve their task id via `BuildStore` for deep-linking.
- **Kinds:** approval / taskDone / taskFailed / buildReady / buildFailed / shipped /
  uploadFailed. **Content-safe** (title + short body only; reasons clipped; no code/secrets).
- **Endpoints:** `GET /notifications` (recent + unread), `POST /notifications/read` `{upTo}`,
  **WS `/notifications/stream?since=`** (replay-then-tail, like the task stream).
- **⚠️ Limitation:** a daemon-only design **cannot wake the phone when it's off Tailscale** —
  true OS push needs an external relay (FCM/ntfy). Notifications surface in-app when connected
  and **catch up on reconnect** (replay by seq). If off-tailnet push is wanted later, add an
  ntfy POST in `NotificationService` as a second sink — the seam is ready.
- **Tested:** typecheck clean, **150/150** (8 new: feed mappers for task/build/upload, service
  persists+emits, ignores non-events, build→task resolution, unread/markRead, replay-by-seq,
  dispose). **Not exercised:** the live WS end-to-end from the phone (needs the Mac serving it).
- **➡️ Action on this Mac:** `git pull` + restart (serves the notifications endpoints + WS).

### 2026-10-10 — S3-08 caffeinate wrapper for long jobs — built on the dev machine
- Build **and** upload steps now run under **`caffeinate -i`** so the Mac can't idle-sleep
  during a 15-minute build (S3-08, CLAUDE.md). Implemented in the spawn runner:
  `makeSpawnRunStep({caffeinate})` prefixes the command via pure `caffeinateWrap` (macOS only
  — no-op on other platforms; `spawnRunStep` stays the caffeinated default). `index.ts` builds
  one runStep from `env.caffeinate` and injects it into both BuildService + DistributionService.
- Config: **`RELAYD_CAFFEINATE`** (on by default; `off` to disable) in `env.ts` + `.env.example`.
- **Tested:** typecheck clean, **142/142** (4 new: wrap on darwin / unchanged on non-darwin /
  unchanged when disabled, **+ a real spawn** that runs `caffeinate -i echo …` and streams the
  output — exercises the actual runner on this Mac). No separate wrapper process to manage; the
  job *is* the caffeinate child, so sleep is prevented exactly for the job's lifetime.
- **➡️ Action on this Mac:** `git pull` + restart — builds will then hold the Mac awake on their
  own (you can drop the outer `caffeinate` around `npm run dev` if it was only there for builds;
  keep it if you also want the daemon itself to survive idle between jobs).

### 2026-10-10 — S3-04 build states + failure handling + retry — built on the dev machine
- **Failed build now shows reason + last log lines.** `GET /builds/:id?tail=N` (default 20,
  `0` to omit) returns the build row **plus `lastLog`** — the tail of the log
  (`build.log`/`build.upload_log`) via new `BuildLog.lastLines`. The failure reason is on the
  row (`error`/`uploadError`); step failures now name the **failing command + exit code**.
- **Retry:** `POST /builds/:id/retry` queues a **new** build (new id) with the same
  project/task/flavor/codegen choice and records lineage (`retryOf`). Refused (409) while the
  original is still queued/running; the flavor guardrail is re-checked on the retry. History
  is preserved (retries are new rows, never mutate the old one).
- DB: `builds` gained `run_codegen` (so a retry faithfully repeats the codegen choice) and
  `retry_of` (+ idempotent `ADD COLUMN` migrations). `BuildRow` carries `runCodegen`/`retryOf`.
- **Tested:** typecheck clean, **138/138** (4 new: failure reason includes the command, log
  tail via `lastLogLines`, retry → new build w/ same settings + lineage, retry refused while
  running). **Not exercised:** a real failing/retried `flutter build` on the Mac.
- **➡️ Action on this Mac:** `git pull` + restart (serves `?tail=` on `GET /builds/:id` and
  the retry endpoint; the `run_codegen`/`retry_of` columns migrate in automatically).

### 2026-10-10 — S3-03 release-notes generation — built on the dev machine
- New `ReleaseNotesService` (`src/build/releaseNotes.ts`): generates **≤8 tester-facing
  bullets** for a task by **resuming that task's Claude session** (SDK `query` with
  `resume: sessionId`, `allowedTools: []`, `maxTurns: 1` — text-only, no tools, never edits),
  reading the final `result` text and parsing bullets. 60s timeout via AbortController.
- **Robust fallback:** no `sessionId`, or the session call fails / times out / returns no
  bullets → **diff-derived** notes from `diffSummary` (verbs by status, generated files
  skipped, overflow folded into "…and N more"). The app always gets something to edit.
- New endpoint `GET /tasks/:id/release-notes` → `{ notes: string[], source: 'session'|'diff' }`.
  Editing happens app-side (S3-06); the edited text is passed to `POST /builds/:id/upload`
  `{releaseNotes}` (S3-02 already accepts it). `query` defaults to the real SDK in production.
- **Tested:** typecheck clean, **134/134** (11 new: parseBullets marker-strip/cap/preamble/
  plain-lines, bulletsFromDiff verb-map/generated-skip/overflow, generate session-success,
  no-session→diff, session-fail→diff, empty→diff, unknown-task + no-worktree errors).
  **Not exercised:** a real session resume (needs the live Mac session store + credits).

### 2026-10-10 — S3-02 Firebase App Distribution upload — built on the dev machine
- New `DistributionService` (`src/build/distributionService.ts`): uploads a **succeeded**
  build's APK to Firebase App Distribution via the Firebase CLI, with tester groups and a
  **release-notes file** written to a temp path (cleaned up after). Output streams into the
  **same build log** (`build.upload_started` / `build.upload_log` / `build.upload_completed`
  / `build.upload_error`), so `/builds/:id/stream` shows build **and** upload together.
- **Refactor:** the live emitter now lives on `BuildLog` (`append` emits; `onEvent`
  subscribes), so BuildService and DistributionService share one feed. `index.ts` wires both
  with the **same `BuildStore` + `BuildLog`** instances (important — don't give them separate
  BuildLogs or live upload events won't reach the stream).
- **Guardrails / safety:** refuses a forbidden Firebase project (e.g.
  `hedged-core-production`) before running; refuses `<placeholder>` appId/groups (app not
  provisioned yet); **requires** the service-account credential env (`serviceAccountEnv`,
  default `GOOGLE_APPLICATION_CREDENTIALS`) and **never** falls back to interactive login
  (CLAUDE.md). Credential value is never logged. Shell-free argv via per-token substitution
  of the manifest `uploadCmd` (`{apk}`/`{appId}`/`{groups}`/`{notesFile}`), so paths with
  spaces stay one argument. Best-effort release URL parsed from the CLI output.
- DB: `builds` gained `upload_status` / `release_url` / `upload_error` (+ idempotent
  `ADD COLUMN` migration in `openDb` for a DB that predates them). New endpoint
  `POST /builds/:id/upload` `{releaseNotes?, groups?}` → 202 (409 on guardrail/bad state).
- **Tested:** typecheck clean, **123/123** (9 new: argv spaced-path substitution, happy-path
  upload with notes file + release-URL parse, temp-dir cleanup, non-zero → failed, forbidden
  project refusal, placeholder appId refusal, missing-credential refusal, not-succeeded
  refusal, missing-artifact refusal). **Not exercised:** a real `firebase appdistribution`
  upload (needs the provisioned app + creds).
- **➡️ Action on this Mac (with S3-01):** `git pull` + restart serves the build + upload
  endpoints. To actually ship: provision the hedged **staging** Firebase app, fill the
  manifest `appId` + tester `groups`, and set `GOOGLE_APPLICATION_CREDENTIALS` to the service
  account JSON (in `env.sh`). Until then upload returns a clear 409 explaining what's missing.

### 2026-10-10 — S3-01 build service — built on the dev machine
- New `BuildService` (`src/build/buildService.ts`): a **serial queue** (one build at a
  time) that runs a project's manifest codegen steps then the APK build command, streaming
  **every stdout/stderr line** to SQLite **event-log-first** and emitting it live. Build
  lifecycle → `builds` table (`BuildStore`); log/lifecycle events → `build_events` table
  (`BuildLog`, monotonic `seq`, `since()` replay — the build-side twin of `EventLog`).
- **Staging-only guardrail enforced at build time:** `enqueue` calls `resolveBuildFlavor`
  before the build row is created, so a forbidden flavor (e.g. `production` during the
  pilot) is refused up front and no build is queued.
- Steps come from the manifest: `[...codegen.steps, build.apk]` (codegen skippable via
  `runCodegen:false`). The APK command supports `{flavor}` templating. If
  `codegen.requiresSibling` is set and the sibling backend checkout is **missing**, the
  build fails immediately with a clear message (the `dart-api-generator.sh` footgun from
  the plan) instead of running a doomed step. Best-effort artifact discovery after success
  (newest `build/app/outputs/flutter-apk/*.apk`) for S3-02 to upload.
- **Command execution is shell-free** (`spawn`, no shell; whitespace-tokenized argv). The
  step runner is injected (`RunStep`) so tests never spawn a real `flutter`.
- New endpoints: `POST /projects/:id/builds` `{flavor?,taskId?,runCodegen?}` (201 → build
  row; 409 on guardrail/inactive), `GET /projects/:id/builds`, `GET /builds/:id`,
  `GET /builds/:id/logs?since=`, `POST /builds/:id/cancel`, and **WS `/builds/:id/stream?since=`**
  (replay-then-tail, same shape as the task stream). Optional `taskId` builds a task's
  reviewed worktree instead of the main checkout.
- **Tested:** typecheck clean, **114/114** (12 new: 3 tokenizeCommand + 9 BuildService —
  step order, codegen skip, **one-build-at-a-time concurrency=1**, non-zero step → failed +
  pipeline stops, guardrail refusal, missing-sibling failure, cancel running, cancel queued,
  seq-ordered replay). **Not exercised:** a real `flutter build apk` on the Mac.
  **Not S3-01:** `caffeinate -i` wrap (S3-08), Firebase upload (S3-02), release notes (S3-03).
- **Note:** `npm run lint` is pre-broken repo-wide (ESLint 9 wants `eslint.config.js`;
  none exists). Typecheck is the gate; unaffected by this change.
- **➡️ Action on this Mac:** `git pull` + restart to serve the build endpoints. The first
  real build needs FVM/Flutter/Android toolchain + (for hedged codegen) the sibling
  `../hedged-core-backend` checkout present; otherwise the build fails fast with that reason.

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
