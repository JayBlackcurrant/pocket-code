# PocketCode app

Flutter client for the PocketCode daemon. Architecture mirrors **hedged-core-app**:
Riverpod 3 (codegen) + **AutoRoute** + feature-first `src/`, `core/` infra, and
`context.colors` / `context.text` theming.

> Routing note: the repo's root CLAUDE.md originally said go_router; per the owner's
> instruction this app uses **AutoRoute**, matching the hedged reference architecture.

## Structure (mirrors hedged)

```
lib/
├── main.dart            # WidgetsFlutterBinding, orientation, runApp(ProviderScope(App()))
├── app.dart             # App(ConsumerWidget): MaterialApp.router(appRouter + theme)
├── app_config.dart      # @Riverpod(keepAlive) appConfig → AppEnv via switch(appFlavor)
├── env/env.dart         # AppEnv + Staging/Production (base URL is runtime, from pairing)
├── core/
│   ├── instances/       # keepAlive providers: apiProvider (Dio), secureStorage, sharedPref; dio_instance
│   ├── interceptors/    # auth_interceptor (Bearer token per request)
│   ├── extension/       # context (colors/text), future (.guard → AppException)
│   └── error/           # AppException + ErrorType
└── src/
    ├── routes/          # app_router.dart (@AutoRouterConfig, keepAlive provider) + guards/
    ├── theme/           # app_color/app_text_theme (ThemeExtensions) + app_theme + theme provider
    ├── shared/          # pairing_provider (session: token+baseUrl in secure storage) + models
    ├── pairing/         # ui/ (QR scan + manual) + providers/ (pairing_controller) + pairing_link
    └── home/            # ui/ (projects list) + providers/ + models/
```

## Status

- **S1-08** App shell + **pairing**: scan the QR from `npm run pair` (or paste the
  `pocketcode://pair?...` link), `POST /pair`, store the device token in
  **flutter_secure_storage**, land on the authenticated projects list (`GET /projects`).
  `PairingGuard` redirects to pairing until paired; "Unpair" clears the token.
- **S1-09** Project list → **new task**: tap an active project → prompt screen →
  `POST /projects/:id/tasks` → navigate to the task screen. Feature `src/tasks/`.
- **S1-10** **Live task stream**: `src/tasks/providers/task_stream.dart` connects to
  `WS /tasks/:id/stream?since=<seq>`, replays missed events then live-tails, and
  **reconnects from the last seen seq** on drop (no lost output). `task_page.dart` renders
  streamed assistant text + tool-call cards + lifecycle/result, with a **Stop** button
  (`POST /tasks/:id/cancel`) and a live status chip. Event→UI mapping is a pure, tested
  function (`task_feed.dart`).

This completes the Sprint 1 app side. Approvals (S2) and build + distribute (S3) are next.

## Toolchain

FVM-pinned Flutter **3.38.3** (`.fvmrc`).

```bash
fvm flutter pub get
fvm dart run build_runner build --delete-conflicting-outputs   # riverpod + auto_route + flutter_gen
fvm flutter analyze
fvm flutter test
fvm flutter run            # on a simulator/device; pair against a running daemon
```

For a simulator, the daemon's default advertise URL (`http://127.0.0.1:8787`) is reachable
as-is. For a physical phone over Tailscale, set `RELAYD_ADVERTISE_URL` on the daemon to the
Mac's MagicDNS URL before `npm run pair` so the QR points at the right host.

## New dependency vs hedged

`mobile_scanner` (QR scanning) — required by the pairing screen; hedged has no scanner.
iOS needs `NSCameraUsageDescription` (added to `ios/Runner/Info.plist`).
