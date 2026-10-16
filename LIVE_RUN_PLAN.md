# Live Run — Hot Reload from PocketCode (Feature 1: spec & implementation plan)

> Feature 1 of the next phase ([`NEXT_PHASE_IDEAS.md`](NEXT_PHASE_IDEAS.md)): run your Flutter app
> **live on your real phone over the tailnet**, with IDE-style controls (Run / Stop / Hot reload /
> Hot restart) driven entirely from **inside PocketCode**, and **auto hot-reload after a Claude
> edit**. Features 2 (Shorebird) and 3 (CI/CD) remain separate tracks in `NEXT_PHASE_IDEAS.md`.
>
> Related: [`PROJECT_DESCRIPTION.md`](PROJECT_DESCRIPTION.md), [`SPRINT_PLAN.md`](SPRINT_PLAN.md),
> [`agent_mac.md`](agent_mac.md), [`app_progress.md`](app_progress.md).

**Last updated:** 2026-10-16 · **Status:** **Feature 1 DONE and verified end-to-end on the real phone** (user-confirmed: discover → run → hot reload/restart/stop → auto-reload after a Claude edit → manual edit → debug console → base run → switch-to-app → concurrency gate → re-arm all working over the tailnet). Daemon S5-01…07 + S5-12 + S5-14; app S5-08…11 + S5-12 + S5-14 + S5-15. Only S5-16 (base+task concurrency) parked (§10.2). Phase 2 extras (§8) done except S5-16/S5-13.

---

## 1. Locked decisions (from the planning session)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Run target | **The real phone**, as a run target via `adb connect` over the tailnet. Not an emulator. |
| D2 | Rooting | **No root.** We use the best non-root path and accept its drawbacks (§6). |
| D3 | Network | Must work on **cellular**. Wi-Fi is available *sometimes* (used for arming). |
| D4 | Where it runs | **Inside the PocketCode app only** — all controls, logs, and code live there. |
| D5 | Seeing the running app | **Phone is the screen.** PocketCode holds the controls; you switch to the running app via Android split-screen / app-switcher. No video streaming. |
| D6 | Code editing | **Phase 1: Claude edits** + auto hot-reload; read-only code view stays. **Phase 2: in-app manual editor** + path-safe daemon write endpoint, which also triggers reload. |
| D7 | Platform | **Android only** (matches current MVP non-goals). |

**Why D5 (not video streaming):** the running Flutter app and PocketCode are two separate Android
apps on one phone; PocketCode cannot embed the live app's screen. The only way to see it inside
PocketCode would be to run the app on an **emulator on the Mac** and stream its video — which throws
away the real-device-over-cellular benefit this whole design is built around. So: the phone *is* the
screen; PocketCode is the remote control. Trade-off: PocketCode and the app share one screen (you
leave PocketCode to look at the app). A floating/split control is a later nicety.

---

## 2. What the user gets (Phase 1)

From PocketCode, on cellular or Wi-Fi:

- **Start / Stop** a `flutter run` session targeting the phone, on the current task's branch.
- **Hot reload** (`r`) and **Hot restart** (`R`) buttons — the Flutter IDE toolbar, on the phone.
- **Live logs**: app stdout/stderr, framework errors, exceptions, and `Reloaded in 230ms` lines,
  streamed with reconnect/replay (`since=<seq>`), same as the task/build streams.
- **Auto hot-reload after a Claude edit**: when a task on the run's branch finishes editing, the
  run session fires a reload automatically — the core daily-loop payoff.
- **Switch to the app**: a prominent "Open app" affordance; Android's app-switcher brings you back.
- A clear **"phone unreachable → Reconnect"** state (never a silent hang) when adb drops (§6).

---

## 3. Device connectivity — non-root adb over the tailnet

### 3.1 Why it works for "Wi-Fi sometimes, cellular always"

Once adb is **armed**, the connection rides the phone's **Tailscale IP (`100.x`)**, which is
network-independent. adbd listens on all interfaces including the Tailscale virtual interface, so:

- **Arming** (enabling Android 11+ Wireless Debugging) wants a **Wi-Fi** network → do it when on Wi-Fi.
- **Running** works on **cellular** — the `100.x` address is reachable regardless of transport.
- **Switching Wi-Fi ↔ cellular mid-session** doesn't drop it — the tailnet IP doesn't change.

(Verified by others: armed on Wi-Fi → Wi-Fi off → mobile data → `adb connect <tailnet-ip>:<port>`
still connects; `flutter run` + hot reload then behave as over USB, with more latency.)

### 3.2 The non-root arming story

**One-time setup** (phone near the Mac, or on Wi-Fi):
1. Pair Wireless Debugging once (`adb pair <ip>:<pairingPort>` with the 6-digit code). Pairing
   persists until factory reset.
2. Install a **boot-helper app** that holds `WRITE_SECURE_SETTINGS`, granted once with
   `adb shell pm grant <pkg> android.permission.WRITE_SECURE_SETTINGS` (this grant survives reboots).
   Candidates to validate first (don't reinvent): `mouldybread/adb-auto-enable`,
   `Tarunswamy-Muralidharan/adb-quickstart`.
3. On the realme phone: enable **Autostart**, exempt the helper (and Tailscale) from **battery
   optimization**, and pin them in recents — ColorOS kills background processes aggressively.

**Steady state:** on each boot (and when Wi-Fi appears) the helper writes
`settings put global adb_wifi_enabled 1`, re-enabling Wireless Debugging with no PC contact.

> ⚠️ **S5-00 result (2026-10-15 — realme 11 Pro 5G, realme UI 6.0 / ColorOS 15 / Android 15):**
> this non-root arming story **does not work on ColorOS 15.** A third-party app (tested with
> MacroDroid, granted `WRITE_SECURE_SETTINGS` after enabling realme's **"USB debugging (Security
> settings)"** dev option — which unlocks `pm grant`) **can** write `adb_wifi_enabled=1`, but
> ColorOS **does not start the adb listener for an app's write.** A/B proven: an identical write
> from the **adb shell** opens the Wireless-Debugging port, the **app** write does not — only the
> shell, the Settings UI, or root start the listener. **So re-arm via the helper is out.** Use
> **`adb tcpip 5555`** instead: it makes adbd listen on `0.0.0.0:5555` (all interfaces incl. the
> Tailscale tun), set **once over USB**, and then the same `adb connect <ip>:5555` works on Wi-Fi,
> cellular, or both — verified with USB unplugged and Wi-Fi off; it survives network switches and
> reconnects via the saved pairing. Its one gap: it **dies on reboot** (non-root can't persist a
> fixed adb port). Hands-off reboot re-arm therefore needs **root** (`persist.adb.tcp.port`,
> declined D2) or a **manual step** after the (rare) reboot: replug USB → `adb tcpip 5555`, or flip
> Wireless debugging ON in the UI on Wi-Fi → daemon scans → re-pin `tcpip 5555`.

### 3.3 The port problem + the daemon connect cascade

Android 14+ **randomizes the adb port** after reboot/sleep. mDNS discovery (the normal fix) is LAN
multicast and **does not cross the tailnet**, so the daemon discovers the port itself:

```
connect cascade (Mac/daemon side):
  1. try last-known <tailnet-ip>:<port>        (stored in DB/config)
  2. if refused → socket-sweep a port range on <tailnet-ip>, adb connect the first that answers
  3. verify with `adb devices` / `flutter devices`
  4. if nothing answers → report "phone unreachable: re-arm needed" (do NOT hang)
```

> **S5-00 note (2026-10-15):** the **serial** sweep is unusable over the tailnet (30000-44000 ×
> ~1s = hours — this was the observed "hang"). A **parallel** socket scan finds the armed port in
> seconds; the daemon's cascade must parallelize it (or use the NSD report below). Prefer trying
> the fixed `:5555` (from `adb tcpip`, see §3.2) **first**, so a scan is only needed right after a
> reboot. Note that even a *successful* scan+connect only works once adbd is actually listening —
> which, on ColorOS 15 without root, does not happen automatically after a reboot (see §3.2).

A later refinement (Phase 2+): the helper app does **on-device NSD** discovery of
`_adb-tls-connect._tcp` and POSTs the current port to the daemon, removing the sweep.

### 3.4 Check direct vs relayed

`tailscale status` — a **relayed (DERP)** path makes hot reload laggy; aim for a **direct** peer.
Surface this in the app (connection quality) so laggy reloads have an explainable cause.

---

## 4. Daemon design (`/daemon`)

Reuses existing primitives; `BuildService` is the closest template. Findings below are from the
current code (file:line) so implementation can follow the established patterns.

### 4.1 New pieces

- **`RunLog`** (`src/db/runLog.ts`) — a twin of `BuildLog` (`src/db/buildLog.ts`): own
  `EventEmitter`, SQLite table with AUTOINCREMENT `seq`, `append()` writes **then** emits
  (event-log-first), `since()` replay, `lastLines()`.
- **`RunStore`** (`src/db/runStore.ts`) — twin of `BuildStore`: a `runs` row per session
  (`id, projectId, taskId?, branch, status, deviceId, debugPort, startedAt, endedAt, error`).
  Statuses: `starting | running | reloading | stopped | failed`.
- **`RunService`** (`src/run/runService.ts`) — spawns and owns the long-lived `flutter run`.

### 4.2 Spawn + control (the gap vs BuildService)

`BuildService` streams a spawned process but **discards the child** once the step resolves and never
writes stdin. A run session needs both. So:

- Extend the spawn wrapper (today `makeSpawnRunStep`, `src/build/buildService.ts:107`) — or add a
  sibling `spawnRunSession` — that **retains the `child`** and keeps `caffeinate -i` (so the Mac
  won't idle-sleep during a long session).
- Launch `flutter run --machine -d <deviceId>` (JSON protocol over stdout). Parse the JSON lines
  into `run.started` / `run.progress` / `run.log` / `run.debugPort` (VM service URI) / `run.error`
  events → `RunLog.append` (event-log-first), mirroring the build event stream.
- **Controls write to the child's stdin / use the daemon protocol:**
  - Hot reload → `app.restart { fullRestart: false }` (or write `r`).
  - Hot restart → `app.restart { fullRestart: true }` (or write `R`).
  - Stop → `app.stop` / write `q`, then abort.
- `AbortController` per session (as BuildService does) for forced kill.

### 4.3 Concurrency — extend the gate, don't fight it

Today the "one task per project" gate is an **in-memory `Set<string> activeProjects`** in
`AgentRunner` (`src/agent/agentRunner.ts:145`), checked on start/continue →
`ProjectBusyError` → **409** (`src/server.ts:316,337`). Tasks run **in place** in the single
checkout, which is why it's serialized.

**Change:** from "one owner" to **"a run session and a task may share the project iff on the same
branch."**
- A run session registers as the checkout's owner **on a specific branch**.
- A new task is allowed **iff** its `baseRef`/branch matches the run's branch (so Claude edits the
  branch and the run hot-reloads from disk) — otherwise **409**.
- Expose the gate so both `RunService` and `AgentRunner` consult one shared owner model (lift it out
  of `AgentRunner` into a small `CheckoutGuard`, or have `RunService` call into `AgentRunner`).

**Clean-tree caveats** (real, from the git service):
- `flutter run` writes `build/`, `.dart_tool/` — **gitignored, tree stays clean** ✓.
- But **non-ignored generated files** (`*.g.dart`, `pubspec.lock`) dirty the tree → would block the
  next task's `createTaskBranch` (`src/git/gitService.ts:167` requires a clean tree). Keep the run on
  the task's branch so no branch *switch* is needed while running.
- `discardTaskBranch` runs `git clean -fd` (`src/git/gitService.ts:193`) → **must stop the run
  session before discarding**, or it nukes the running build outputs. Enforce: discard refuses (409)
  while a run session is live on that branch.

### 4.4 Auto-reload after a Claude edit

`RunService` subscribes to `AgentRunner.onEvent` (`src/agent/agentRunner.ts:200`) — the same seam
`NotificationService` already uses. On `task.completed` for a task on the run's branch, fire a hot
reload. Debounce so a burst of edits coalesces into one reload.

### 4.5 Event streaming + endpoints

Clone the build-stream WS handler verbatim (`src/server.ts:727`, replay-before-live buffering,
`stream.caughtup`). New routes (register after `fastifyWebsocket`, mirror build routes):

| Method / path | Purpose |
|---|---|
| `GET /projects/:id/devices` | List adb devices (runs the connect cascade; returns device id + connection quality) |
| `POST /projects/:id/runs` `{ taskId?, deviceId, branch? }` | Start a run session (201; 409 if checkout busy on another branch / device unreachable) |
| `POST /runs/:id/reload` | Hot reload |
| `POST /runs/:id/restart` | Hot restart |
| `POST /runs/:id/stop` | Stop the session |
| `GET /runs/:id` | Status row + last log lines |
| `GET /runs/:id/logs?since=` | Replay |
| `WS /runs/:id/stream?since=` | Live logs + lifecycle, replay-then-tail |

Wire `RunStore` / `RunLog` / `RunService` as shared singletons in `src/index.ts` (over the one
`db`), thread into `ServerDeps`, set the pino logger after construction.

---

## 5. App design (`/app`)

- New `src/run/` feature (mirrors `src/builds/`): `models/run_row.dart`, `run_feed.dart` (pure
  event→line + status reducers), `providers/run_stream.dart` (WS replay/reconnect, same contract as
  `BuildStream`), `providers/run_actions.dart`, `ui/run_page.dart`.
- **Entry point:** a "Run" action on the task page (next to the build rocket) → `RunRoute`
  (`/tasks/:taskId/run`).
- **Run screen** (IDE-toolbar feel): a device picker (from `GET /projects/:id/devices`); a control
  bar — **Run / Stop**, **Hot reload (↻)**, **Hot restart (⟳)**; a status chip
  (starting/running/reloading/stopped/failed) + connection quality (direct/relayed); and a
  **virtualized live log** (`ListView.builder`, size-capped, monospace, colored lifecycle/error
  lines, auto-scroll) — all per `CLAUDE.md` app rules.
- **"Open app"** button → Android intent to the launched package (and a hint to use split-screen).
- Resume the latest **in-progress** run for the task on open (same fix pattern as the builds screen).
- **Swipe between panels** (D4 "slide"): the Run screen uses segments (e.g. **Logs | Code |
  Controls**) you swipe between inside PocketCode. Seeing the *actual running app* = app-switch (D5).
- **Phase 2:** make the Code panel editable + a `POST /tasks/:id/file` write endpoint (path-safe,
  contained to the project dir); saving triggers a hot reload.

**Biometric gate:** starting a run is not destructive (no push/distribute), so no `local_auth` gate
in Phase 1 unless we decide otherwise. (Phase 2 manual file-write may warrant one — open question.)

---

## 6. Drawbacks & risks (accepted, non-root)

1. **One-time Wi-Fi/USB contact required** for the initial pairing + `pm grant` — can't be set up
   purely remotely (fine; you'll have the phone in hand at setup).
2. **Reboot while purely on cellular** = re-arming may wait until the next Wi-Fi contact; run feature
   unavailable in that gap (self-healing, rare).
3. **realme/ColorOS background-killing** — biggest reliability risk; needs autostart + battery
   exemption + pinning, and may still need bringing the helper/app to foreground.
4. **Android 14+ random port** → daemon must discover it each connect (sweep is slow over a relayed
   tailnet; on-device NSD report is the Phase 2 fix).
5. **Relayed-tailnet latency** → laggy hot reload if not a direct peer.
6. **Security** → `WRITE_SECURE_SETTINGS` is powerful and adb-over-network widens attack surface;
   mitigated by tailnet-only binding + tight Tailscale ACLs. Never expose adb publicly.
7. **Unofficial helper tooling** → community apps, maintenance burden; may build a small custom one.
8. **Not 100% zero-touch** → occasional manual tap after some reboots/kills. Root is the only way to
   remove that entirely (declined, D2).

**Design response:** treat "adb unreachable" as a first-class, one-tap-**Reconnect** state so the
occasional re-arm is a 5-second annoyance, never a hang.

---

## 7. Open questions

- [ ] Off-the-shelf boot-helper good enough, or build a small custom helper (NSD port report + realme
      autostart handling)?
- [ ] Port-discovery: socket-sweep range vs on-device NSD report — start with sweep, measure.
- [ ] Concurrency: lift the gate into a shared `CheckoutGuard`, or have `RunService` call
      `AgentRunner`? (Same-branch run+task is the goal.)
- [ ] Biometric gate on starting a run / on Phase 2 manual file writes?
- [ ] Does `flutter run --machine` over a relayed tailnet stay stable enough for a long session, or
      do we need periodic liveness checks + auto-reconnect?

---

## 8. Task breakdown — Sprint 5 (Live Run)

**Phase 0 — prove the pipe (no app/daemon code):**
- [ ] **S5-00** Standalone `scripts/adb-connect.sh` connect cascade (last-known port → sweep →
      `adb connect` → `flutter devices`). Arm the phone once; prove `flutter run` + hot reload hold
      up to the realme **over cellular**. Measure reload latency; note direct vs relayed. *Gate: if
      this is unusable, revisit the whole feature before writing daemon code.*
  > **Result (2026-10-15) — connectivity gate PASSED; latency pending.** Fixed-port `adb tcpip 5555`
  > reaches the phone on cellular (USB unplugged, Wi-Fi off) over the tailnet — same command on any
  > network, no port guessing, no toggling; reconnect via the saved pairing. Replace the serial
  > sweep with a **parallel** scan (§3.3). **Reboot re-arm is blocked on ColorOS 15** → root or a
  > manual step (§3.2). Cellular path is often **relay (DERP), ~70–150 ms** → hot reload works with
  > mild lag. **Still to capture:** the actual hot-reload latency number (`flutter run -d <ip>:5555`
  > then `r`). Daemon implication (S5-06): `connectCascade` = try `:5555` → else parallel scan →
  > else a one-tap "phone needs re-arm" state (never hang).

**Phase 1 — daemon run session:** _(COMPLETE on branch `claude/live-run`; 247 tests)_
- [x] **S5-01** `RunLog` + `RunStore` (+ migrations), wired as singletons in `index.ts`.
- [x] **S5-02** `spawnRunSession` (retained child + stdin + caffeinate) and `flutter run --machine`
      JSON parsing → run events.
- [x] **S5-03** `RunService`: start/reload/restart/stop; event-log-first; AbortController cancel.
- [x] **S5-04** Extend the concurrency gate (shared `CheckoutGuard`: run + task same-branch); discard
      refuses while a run is live.
- [x] **S5-05** Endpoints + WS stream (`/projects/:id/runs`,
      `/runs/:id/{reload,restart,stop}`, `GET /runs/:id`, `/runs/:id/logs`, `WS /runs/:id/stream`).
- [x] **S5-06** Device discovery endpoint (`GET /projects/:id/devices?host=`) runs the connect
      cascade; returns device serial + link quality (or `reArmNeeded`).
- [x] **S5-07** Auto-reload after a Claude edit (subscribe to `AgentRunner.onEvent`, debounced).

**Phase 1 — app:** _(COMPLETE on branch `claude/live-run`; 54 tests)_
- [x] **S5-08** `src/run/` feature: run_row, run_feed, run_stream, run_actions.
- [x] **S5-09** Run screen: device picker, control bar (Run/Stop/Reload/Restart), status +
      connection quality, virtualized live log, "switch to app" hint.
- [x] **S5-10** Task-page entry + resume-in-progress-run; swipeable **Logs | Code** tabs (control
      bar persistent; Code lists the task's changed files → opens the diff/code viewer).
- [x] **S5-11** "Phone unreachable → re-arm" card + instructions (reconnect/re-check).

**→ Feature 1 (live run) is code-complete. Remaining before relying on it: a real end-to-end on the
armed phone (no real `adb`/`flutter run` exercised yet — everything is fake/unit-tested).**

**Phase 2 (later):**
- [x] **S5-12** In-app manual code editor + path-safe `POST /tasks/:id/file` write → triggers reload.
      _(Daemon `writeFileSafe` + endpoint, 256 tests; app `CodeEditorPage` from the run Code tab.)_
- [ ] **S5-13** Custom boot-helper app (NSD port report, realme autostart) if off-the-shelf falls
      short.
- [x] **S5-14** **Debug console** via the Dart VM Service (see §10.3). _(Daemon `vmService.ts` →
      `run.console` events, 266 tests; app renders them in the Logs tab.)_
- [x] **S5-15** **Run the base branch** without a task (project-level Run entry) ✅ + "switch to
      app" ✅ (backgrounds PocketCode via a native `moveTaskToBack` channel — Android can't force
      split-screen, §10.1). _App only; `RunService` already runs the base when started with no task._
- [ ] **S5-16** **Base + task concurrent runs** — needs two working trees + two devices/appIds; large,
      reverses the single-checkout model (see §10.2). Park unless clearly needed.

**Definition of done** (per `CLAUDE.md`): typecheck/analyze/lint clean, tests for changed behavior,
no secrets, docs updated, progress logs (`agent_mac.md` / `app_progress.md`) updated.

---

## 9. Sequencing — where we start

**S5-00 first.** No daemon/app code until the connect cascade proves `flutter run` + hot reload are
usable to the real phone over cellular. Everything downstream depends on that being true, so we
de-risk it on day one with a throwaway script before building `RunService`.

---

## 10. Enhancement ideas (from the 2026-10-15 review)

Three questions raised after Feature 1 went code-complete. Captured here with the honest feasibility.

### 10.1 Seeing the app *inside* PocketCode
Android does **not** allow embedding another app's screen inside yours (reserved for launchers /
accessibility / screen-capture), and the run target is a separate app/process. So true embedding
isn't possible while the app runs on the phone itself. Ways to see it *alongside*:
- **Split-screen:** Android's built-in split view — but an app **cannot force** split-screen (it's
  user-initiated via recents), so there's no button for it. Instead **S5-15 backgrounds PocketCode**
  (`moveTaskToBack` via a native channel) so the running app comes forward; the user can pin them
  side-by-side via recents. ✅ done.
- **Picture-in-Picture:** the app under test floats over PocketCode — but only if *that* app opts
  into PiP, so not general.
- **Emulator-on-Mac + video stream:** the only path to true "inside the app", but it abandons the
  real-device-over-cellular design (the D5 fork we rejected). Heavy; not planned.

### 10.2 Running the base branch, and base + task at once
Two separate asks:
- **Run the base branch (no task):** already supported by the daemon — `POST /projects/:id/runs`
  with no `taskId` runs the current checkout (which can be base). Only missing a **project-level
  Run entry** in the app. Small. → part of **S5-15**.
- **Base *and* a task branch at the same time:** blocked by two hard limits — (1) tasks run in the
  **single** project checkout (worktrees were dropped because they don't carry the gitignored
  signing keys), and `CheckoutGuard` allows a run + task only on the **same** branch; (2) base and a
  task share the **same applicationId**, so the same app can't run twice on one phone. Needs **two
  working trees** (git worktree — a debug run self-signs, so it may not need the release keystore
  that broke worktrees for *builds* — or a second clone) **and** **two devices or distinct appIds**.
  Large, and reverses a core decision. → **S5-16**, parked unless clearly worth it.

### 10.3 A debug console instead of the terminal log
Today the daemon streams `flutter run` stdout (`app.log` lines). A proper **debug console** means
connecting to the app's **Dart VM Service** — whose URI we already capture (`run.debugPort` →
`wsUri`) — via the `vm_service` protocol, and surfacing its structured streams: `Logging` (levels,
logger names, timestamps), structured **errors + stack traces**, and optionally expression
**eval**/inspection. Clean, well-scoped, fits the event-log-first + WS-replay model (new daemon
VM-service client emitting `run.console` events + an app console view). **Recommended first Phase-2
item.** → **S5-14**.

---

## 11. On hold / parked (Feature 1 scope)

- ✅ **Real end-to-end on the armed phone** — DONE 2026-10-16, user-confirmed all flows working.
- **S5-16** base + task concurrent runs (parked — needs 2 checkouts + 2 devices/appIds, §10.2).
- **S5-13** custom boot-helper app (only if the off-the-shelf arming proves unreliable on ColorOS).
- **S5-16** — base + task concurrent runs (the §10.2 enhancement; parked — needs 2 checkouts + 2
  devices/appIds).
- Broader project items (Sprint 4 hardening, LaunchAgent install, Shorebird, CI/CD) live in
  [`agent_mac.md`](agent_mac.md), [`app_progress.md`](app_progress.md) and
  [`NEXT_PHASE_IDEAS.md`](NEXT_PHASE_IDEAS.md).
