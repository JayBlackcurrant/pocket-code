# App — progress log

> **Cross-device progress log for the Flutter app side of PocketCode (`/app`).**
> Partner file: [`agent_mac.md`](agent_mac.md) (Mac / daemon side).
> Both Claude Code instances read **both** files at the start of every session so the two
> devices stay in sync. See `CLAUDE.md` → "Progress tracking".
>
> **Conventions:** newest entry on top of the Log. Keep secrets OUT — no device tokens or
> pairing codes. The app stores its token in `flutter_secure_storage` only.

**Last updated:** 2026-10-09 — seeded by Claude Code on the Mac (app-side agent: please take over here)

---

## Status snapshot

| Area | State |
|------|-------|
| App scaffold (`/app`: Riverpod, go_router, secure storage) | 🟡 present — per-screen status **to confirm by app-side agent** |
| Pairing (S1-08: QR scan → token) | ✅ works — phone paired & connected to the daemon (2026-10-09, user-confirmed) |
| Project list / new task (S1-09) | ❓ unverified |
| Task stream screen (S1-10) | ❓ unverified |
| Approvals UI (S2-04) | ⬜ not started / unverified |
| Diff review + code viewer (S2-07, S2-08) | ⬜ not started / unverified |
| Builds screen + biometric gate (S3-06, S3-07) | ⬜ not started / unverified |

> The 🟡/❓ rows are placeholders written from the Mac side without inspecting `/app` internals.
> **App-side agent: verify against the code and correct these on your first session.**

---

## App task checklist (from `SPRINT_PLAN.md`)

- [x] **S1-08** Flutter shell: Riverpod, go_router, secure storage, pairing screen (QR scan) — *pairing confirmed working 2026-10-09*
- [ ] **S1-09** Project list + "new task" screen
- [ ] **S1-10** Task stream screen (text deltas, tool-call cards, stop button; reconnect replays via `since=<seq>`)
- [ ] **S2-04** Approval cards (Allow once / Always / Deny with reason)
- [ ] **S2-07** Review screen (file list, +/- counts, unified/stacked diff; smooth on large diffs)
- [ ] **S2-08** Code viewer with syntax highlighting (chunked for large files)
- [ ] **S3-06** Builds screen (group picker, notes editor, progress, Firebase link)
- [ ] **S3-07** Biometric gate (`local_auth`) for push / build / "always allow"

---

## Reminders for the app side (from `CLAUDE.md`)

- Token in `flutter_secure_storage` only. Network: `dio` (REST) + `web_socket_channel` (streams); on reconnect request `since=<last seq>`.
- Virtualize large content (`ListView.builder`), size-capped. Collapse generated files in diffs: `*.g.dart`, `*.freezed.dart`, `pubspec.lock`.
- Sensitive actions (push, build & distribute, "always allow") require a biometric check.
- Notifications must never contain code or secrets. Follow `app/analysis_options.yaml`; prefer `const` + small widgets.
- The daemon's base URL for the phone is the Tailscale MagicDNS HTTPS URL (delivered via the pairing QR).

---

## Next up (App side)

- [ ] App-side agent: confirm the real state of S1-08…S1-10 against `/app/lib` and fix the Status snapshot above.
- [ ] Run `flutter pub get`, `dart format .`, `flutter analyze`, `flutter test` and record results here.

---

## Log

### 2026-10-09 — paired & connected (seeded from the Mac)
- The daemon Mac setup completed and the phone (`realme-11-pro-5g`) **paired and connected successfully** over Tailscale — so the app's pairing flow (S1-08) works end-to-end against a live daemon.
- This file was created from the Mac side as a starting point; app internals were **not** inspected here. App-side Claude Code: verify and expand on your next session.
