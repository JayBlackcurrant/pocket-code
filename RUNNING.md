# Running PocketCode

How to run the **daemon** (`/daemon`, Node/TS) and the **app** (`/app`, Flutter) — from
VS Code (`.vscode/launch.json`) or the terminal. See `daemon/README.md` and `app/README.md`
for architecture.

---

## 1. Prerequisites

**Daemon (agent Mac):**
- Node 20+ (`node -v`)
- Claude Code logged in on this Mac (the Agent SDK uses that session — no API key needed):
  - `npm install -g @anthropic-ai/claude-code`
  - `claude` → log in with your subscription, then verify: `claude -p "say hi"`
- Tailscale (for phone access) + the projects checked out under `~/workspaces`.

**App (dev Mac):**
- FVM with Flutter **3.38.3** (pinned by `app/.fvmrc`). First time, in `app/`:
  - `fvm install` then `fvm use 3.38.3` (creates `.fvm/flutter_sdk`, which VS Code uses)
- A connected device or simulator (`fvm flutter devices`).

---

## 2. Daemon config (`daemon/.env`)

The VS Code launch config loads `daemon/.env` automatically. Create it from the example:

```bash
cp daemon/.env.example daemon/.env
```

Then edit `daemon/.env` — a working example for the always-on Mac (replace the home path
and MagicDNS name with yours):

```
RELAYD_HOST=127.0.0.1
RELAYD_PORT=8787
RELAYD_PROJECTS_DIR=./config/projects
RELAYD_DB_PATH=./data/relayd.sqlite
RELAYD_ALLOWED_ROOTS=/Users/<you>/workspaces
AGENT_HOME=/Users/<you>
RELAYD_ADVERTISE_URL=https://<your-mac>.tailXXXX.ts.net
```

Notes:
- `AGENT_HOME` + `RELAYD_ALLOWED_ROOTS` make `hedged` resolve to
  `/Users/<you>/workspaces/hedged-core-app` **inside** the allowlist → status `active`.
- **Leave `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` unset** to use the logged-in
  Claude Code subscription. Only set one of them if you prefer API-key / token auth.
- For a phone over Tailscale, serve the daemon over HTTPS and match `RELAYD_ADVERTISE_URL`
  to it: `tailscale serve --bg 8787` then `tailscale serve status`.

> Terminal runs do **not** read `.env` (the daemon has no dotenv loader). For the terminal,
> export the same vars first (e.g. keep them in `daemon/env.sh` and `source env.sh`).
> VS Code's launch config injects `.env` via `envFile`, so running from VS Code "just works".

---

## 3. Run from VS Code (`.vscode/launch.json`)

Open the `claude-app` folder in VS Code and use **Run and Debug** (⇧⌘D):

| Configuration | What it does |
|---|---|
| **Daemon (relayd)** | Runs `src/index.ts` via `tsx`, loads `daemon/.env`, breakpoints work. |
| **App (PocketCode · debug)** | `flutter run` (debug) on the selected device, FVM SDK. |
| **App (PocketCode · release)** | `flutter run --release`. |
| **Daemon + App** | Compound: starts the daemon and the app together. |

First run only, install deps: `npm ci` in `daemon/`, and `fvm flutter pub get` + codegen
(below) in `app/`.

---

## 4. Run from the terminal

**Daemon:**

```bash
cd daemon && npm ci
```

```bash
cd daemon && source env.sh && npm run dev
```

Health check (new terminal): `curl http://127.0.0.1:8787/healthz` → `{"ok":true,...}`.
Confirm the startup log shows `hedged` with `status: active`.

**App:**

```bash
cd app && fvm flutter pub get
```

```bash
cd app && fvm dart run build_runner build --delete-conflicting-outputs
```

```bash
cd app && fvm flutter run --release
```

> Re-run `build_runner` whenever you change a provider, route, or model (Riverpod /
> AutoRoute / flutter_gen are codegen). `*.g.dart` / `*.gr.dart` are generated — never edit.

---

## 5. Pair the phone

On the agent Mac, generate a one-time pairing code (QR + paste-able link, ~5 min):

```bash
cd daemon && source env.sh && npm run pair
```

In the app: scan the QR (or tap the keyboard icon and paste the `pocketcode://pair?...`
link) → you land on the projects list → tap `hedged` → enter a prompt → watch it stream.

---

## 6. Checks before calling a change done

```bash
cd daemon && npm run typecheck && npm test
```

```bash
cd app && fvm flutter analyze && fvm flutter test
```

---

## Troubleshooting

- **`hedged` shows `unresolved`/`rejected`** → `AGENT_HOME` / `RELAYD_ALLOWED_ROOTS` not set
  (terminal: forgot `source env.sh`; VS Code: `daemon/.env` missing those lines), or the repo
  isn't at `$AGENT_HOME/workspaces/hedged-core-app`.
- **Task immediately errors (auth/billing)** → Claude Code not logged in on the agent Mac,
  or an empty `ANTHROPIC_API_KEY` is set. Unset it; re-verify `claude -p "say hi"`.
- **App can't reach the daemon** → `RELAYD_ADVERTISE_URL` must equal the `tailscale serve`
  URL, and the phone must be on the same tailnet. Plain `http://` to a non-localhost host is
  blocked by iOS/Android — use the Tailscale HTTPS URL.
- **VS Code uses the wrong Flutter** → ensure `app/.fvm/flutter_sdk` exists (`fvm use 3.38.3`
  in `app/`); `.vscode/settings.json` points the Dart extension at it.
- **Daemon won't start: "would expose the daemon publicly"** → `RELAYD_HOST` is `0.0.0.0`;
  use `127.0.0.1` (with `tailscale serve`) or the Tailscale IP.
