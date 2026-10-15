# Next Phase — Live Run + Shorebird + CI/CD (brainstorm & tracking)

> Living planning doc. Captures the brainstorm from the 2026-10-13/15 sessions so work can
> be picked up anytime. **Nothing here is built yet** — this is design + research + open
> questions. Update the checkboxes and "Decisions" as things land.
>
> Related docs: [`ROADMAP.md`](ROADMAP.md), [`SPRINT_PLAN.md`](SPRINT_PLAN.md),
> [`PROJECT_DESCRIPTION.md`](PROJECT_DESCRIPTION.md). Progress logs:
> [`app_progress.md`](app_progress.md), [`agent_mac.md`](agent_mac.md).

**Last updated:** 2026-10-15

---

## Where we are (baseline)

The MVP pipeline is **working and user-tested on a real device**: run a task from the phone →
review diff → commit → build an APK → install. Sprints 1–3 are merged to `main`; Sprint 4
(hardening) is partly done (S4-01 LaunchAgent files, S4-02 crash recovery).

This doc is about the **next phase**: turning PocketCode from "remote code + ship" into a
**full remote dev loop** — run the app live with hot reload, and release/patch through a
proper CI/CD pipeline.

---

## The three features we want

1. **Run the app on the phone + hot reload / hot restart**, with the **phone as the run
   target via `adb connect` over the tailnet** (chosen over an emulator-on-Mac approach).
2. **Shorebird** for **releasing builds** and **pushing over-the-air patches**.
3. **CI/CD** that automatically **releases to Play Store and App Store**, with **Shorebird
   patches in the same pipeline**.

Everything should reuse the daemon's existing primitives where possible: event-log-first +
WebSocket replay (`since=<seq>`), the serial build queue, Tailscale HTTPS, in-place
`claude/<slug>` task branches, and the Agent SDK runner.

---

## Feature 1 — Live run + hot reload (phone as target over tailnet)

### Goal
From PocketCode: start/stop the app running on **your own phone**, trigger **hot reload** and
**hot restart**, watch logs/errors live — and ideally **auto-reload when Claude finishes an
edit** on the task's branch.

### Mechanism
- Daemon spawns `flutter run --machine -d <device>` (JSON protocol over stdout).
- Control commands map cleanly onto the existing WS plumbing:
  - `app.restart { fullRestart: false }` → **hot reload**
  - `app.restart { fullRestart: true }` → **hot restart**
  - `app.stop` → quit
  - daemon emits back `app.started`, `app.progress`, `app.log`, `app.debugPort` (VM service URI)
- A **run session** is essentially a long-lived build with two-way control → wrap it with the
  same event-log-first + `since=<seq>` replay the task/build streams already use.

### Device target: the phone over the tailnet (chosen)
Research findings (community guides — verify on-device):
- Both devices on the **same tailnet** (same Tailscale account). Check `tailscale status` for
  **direct vs relayed** — **relayed = laggy hot reload**; aim for a direct peer connection.
- **Android 11+ wireless debugging** uses a pairing code but is effectively **Wi-Fi/same-LAN**.
- **For remote/cellular over the tailnet:** the usual workaround is to put adb in TCP mode once
  per boot over USB: `adb tcpip 5555`, then `adb connect <tailscale-ip>:5555`, confirm with
  `adb devices`, then `flutter run`. **Hot reload works like USB** once connected.
- **Gotchas:** wireless ADB port can change after reboot/re-enable; relayed connections lag;
  device can show offline → re-check Tailscale on both ends.

### ⚠️ Key friction to solve (open)
`adb tcpip 5555` needs a **USB connection once per device boot** to enable TCP mode. The phone
is remote from the always-on Mac, so we need a story for this:
- Option: enable persistent **wireless debugging** and script re-pairing, or
- Option: a one-time USB enable when the phone is near the Mac, documented as a limitation, or
- Research whether newer Android/adb keeps TCP mode across boots, or a helper app on the phone
  can re-expose it.

### "How do you see it?" — the phone IS the screen
Because the run target is your real phone, you **just switch apps** to see the running app — no
screen streaming needed. Trade-off: **PocketCode and the app share one screen** (you leave
PocketCode to look at the app). v1 can live with this; a split/floating control later.

### Daemon design question (open)
A long-lived run session **holds the project checkout**. How does it coexist with the
**one-task-per-project** gate (`ProjectBusyError` → 409)? Likely rule: a **run session and a
task on the SAME branch** are allowed together, so Claude edits the branch and the run hot-reloads
from disk. Needs a concrete concurrency model.

### Suggested MVP
Run session on the phone → stream **logs + exceptions + "reloaded in 230ms"** → buttons
**Reload / Restart / Stop** → **auto-reload after a Claude edit** on the same branch. This rides
entirely on existing infra; no new accounts.

---

## Feature 2 — Shorebird (release build + OTA patch)

### Why it fits
Shorebird is Flutter **code push**: ship Dart changes to installed apps **without a store
release**. Matches the words exactly — **"release the build"** = `shorebird release`,
**"manage patch"** = `shorebird patch`. The loop becomes: Claude fixes a bug → review → commit →
**one tap pushes a patch** → users have it in seconds, no reinstall.

### How it works (research)
- A release is a normal `flutter build` + the Shorebird updater; the app checks for and downloads
  new Dart code at runtime.
- **Android:** patch = recompiled Dart in the Dart VM (straightforward).
- **iOS:** uses a **Dart interpreter** (slower than native); iOS support reported **alpha/beta**
  as of 2025 — verify current status before relying on it in prod.
- CLI: `shorebird release android|ios`, `shorebird patch android|ios`.

### Limitations (important)
- **No native code** in a patch (no Kotlin/Java/Swift/ObjC changes) — the tool warns if native
  changed.
- **Cannot change the Flutter engine/version** via patch.
- **Assets** (images/fonts) not updatable by a patch as of the source's date — verify.
- Needs **connectivity**; applies on next restart with network.
- **iOS obfuscation** not supported as of Feb 2025 (verify).
- **No web.**
- **Store policy:** don't use code push to materially change behavior / bypass review — Shorebird
  says so too.

### Implications for PocketCode
- Coexists with (doesn't replace) the **keyless Tailscale-served APK** — Shorebird is for
  patching released apps; the tailnet APK is for internal/tester installs.
- Needs a **Shorebird account + API token** (`SHOREBIRD_TOKEN`) — another credential to manage
  (env/Keychain, never in repo or logs).
- App UI idea: a **Releases** view showing "Release 1.2.0 → N patches, installs on latest."

---

## Feature 3 — CI/CD to the stores (+ Shorebird patches in the same pipeline)

### Goal
Automatic **release to Play Store and App Store**, and **patch** in the same pipeline —
triggered from PocketCode and/or git.

### Big architecture decision (open) — where does CI run?
- **A) GitHub Actions (cloud):** matches most guides; survives the Mac being down; standard
  runners (Ubuntu for Android, **macOS runner for iOS**). PocketCode triggers via `gh`/push.
- **B) Daemon-orchestrated on the Mac (self-hosted):** fits the project's "service that starts
  and ends with the daemon, no extra" philosophy and reuses the serial build queue + log
  streaming — but iOS signing/toolchain on the Mac is heavier, and no builds when the Mac is off.
- Likely answer: **hybrid** — daemon triggers, GitHub Actions executes store releases (so a
  downed Mac doesn't block releases), while **local builds + Shorebird patches** can run on the
  daemon for speed. **Decide early; it shapes everything.**

### Store release mechanics (research)
- **fastlane** is the common tool:
  - **Android:** `supply` / `upload_to_play_store` with a **Google Play service account JSON**,
    uploading the `.aab` from `flutter build appbundle`; staged tracks (internal/beta/prod).
  - **iOS:** `gym`/`build_app` → `pilot` (TestFlight) / `deliver` (App Store), authenticating
    with an **App Store Connect API key** (key id, issuer id, key) — not an Apple ID password.
- **GitHub Actions:** decode secrets to files at runtime, bump build number, run lanes on a tag
  or release branch. **Ubuntu** runner (Android), **macOS** runner (iOS).
- **Secrets needed:** Play service account JSON (base64), App Store Connect API key, Android
  keystore, Shorebird token. All as encrypted CI secrets / daemon env — **never in repo or logs**.
- Hosted alternatives if we don't want to maintain a pipeline: **Codemagic, Bitrise, Appcircle**.

### Shorebird in CI (research)
- Official **GitHub Actions** guide exists: `setup-shorebird` action + `SHOREBIRD_TOKEN` secret.
- Pattern: branches with a `release/` prefix off `main` → **releases**; later commits on them →
  **patches**; hotfix tags (e.g. `v1.0.0-hotfix.1`) → **patches**.
- Generic CI: just swap `flutter build --release` for `shorebird release` / `shorebird patch`.
- No official **fastlane** integration found — run a Shorebird step **before/after** fastlane
  lanes in the workflow (a community tool `flutter_setup` scaffolds this).

### iOS reality check
iOS **releases** need a **Mac + Xcode + signing + Apple Developer account**; the hot-reload
**run target** (Feature 1) is the **Android phone**. iOS is a separate track — plan Android first,
iOS when the Apple account/signing is ready.

---

## Suggested sequencing

1. **Feature 1 MVP** — run on the phone over tailnet, logs + hot reload/restart, auto-reload
   after a Claude edit. Biggest daily payoff; no new accounts. Solve the `adb tcpip` once-per-boot
   friction first.
2. **Feature 2** — Shorebird release + patch (Android first). One-tap patch closes the loop.
3. **Feature 3** — CI/CD: decide cloud vs daemon-orchestrated; Android store release + Shorebird
   patch in one pipeline; iOS later.

---

## Open questions / decisions to make

- [ ] **adb over tailnet:** how to handle `adb tcpip` once-per-boot for a remote phone? Direct vs
      relayed latency acceptable for hot reload?
- [ ] **Concurrency:** how does a run session coexist with the one-task-per-project gate? (Run +
      task on the same branch?)
- [ ] **CI location:** GitHub Actions (cloud) vs daemon-orchestrated on the Mac vs hybrid?
- [ ] **Shorebird:** account + token provisioning; where secrets live; Android-only first?
- [ ] **iOS:** is there an Apple Developer account + signing? If not, Android-only for now.
- [ ] **Store credentials:** Play service account JSON + App Store Connect API key — who provisions?
- [ ] **Shorebird iOS maturity + assets/obfuscation limits** — re-verify current status before use.
- [ ] **Release model in the app:** version bump UI, release history, channels/promote?

---

## Research sources (2026-10-15)

- Shorebird GitHub Actions / CI: https://docs.shorebird.dev/ci/github and
  https://docs.shorebird.dev/code-push/ci/github/ ; generic CI:
  https://docs.shorebird.dev/code-push/ci/generic/ ; dev workflow:
  https://docs.shorebird.dev/code-push/guides/development-workflow/
- Shorebird architecture / limits: https://docs.shorebird.dev/code-push/system-architecture/ ;
  FAQ: https://docs.shorebird.dev/faq ; intro:
  https://pro.codewithandrea.com/flutter-in-production/13-shorebird/01-intro
- adb over Tailscale / Flutter wireless debugging:
  https://dev.to/vjnvisakh/flutter-debugging-wirelessly-bmk ;
  https://dev.to/quedicesebas/connect-your-android-device-over-wifi-in-vscode-to-run-and-debug-your-flutter-app-1gbh
- Flutter CD (official): https://docs.flutter.dev/deployment/cd.md
- fastlane + GitHub Actions for Flutter:
  https://www.freecodecamp.org/news/how-to-automate-flutter-releases-with-fastlane-and-github-actions/ ;
  https://dev.to/actocodes/the-flutter-to-devops-pipeline-how-to-automate-play-store-deployments-with-github-actions-45kk

> Several sources are community guides, not official docs — **verify specifics (CLI flags,
> fastlane action names, Shorebird iOS status) against current official docs before building.**
