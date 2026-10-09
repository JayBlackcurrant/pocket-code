# Agent Mac setup (the always‑on Mac)

Configure PocketCode on the dedicated Mac from a fresh `git clone`. This Mac runs the
**daemon** and holds the **managed project repos**. The Flutter **app** runs on your phone,
not here. (Flutter/FVM on this Mac is only needed later for Android builds — Sprint 3 — not
for running/streaming tasks now.)

> Verified end‑to‑end from a clean clone: `npm ci` → typecheck → 44 tests pass → daemon
> starts with `hedged` **active** → `/healthz` ok → pairing code generated.

---

## 0. Prerequisites

- **Node 20+** (`node -v`), **git**
- **Claude Code** logged in (you confirmed `claude -p "say hi"` works). The Agent SDK uses
  that session — no API key needed.
- **Tailscale** (for the phone to reach this Mac)

---

## 1. Layout

Put everything under `~/workspaces` so the project manifest resolves without edits — the
`hedged` manifest expects the repo at `$AGENT_HOME/workspaces/hedged-core-app`:

```
~/workspaces/
├── claude-app/           # this repo (daemon lives in claude-app/daemon)
└── hedged-core-app/      # the project the daemon drives (branch: stag)
```

```bash
mkdir -p ~/workspaces
```

Clone this repo:

```bash
git clone git@github.com:JayBlackcurrant/pocket-code.git ~/workspaces/claude-app
```

Put the managed project here too (clone from its own remote, or copy your existing folder):

```bash
git clone <hedged remote> ~/workspaces/hedged-core-app
```

```bash
cd ~/workspaces/hedged-core-app && git checkout stag
```

> If you only copied it (from the zip), that's fine — just ensure it lives at
> `~/workspaces/hedged-core-app` and has a `.git` folder with a `stag` branch.

---

## 2. Install the daemon

```bash
cd ~/workspaces/claude-app/daemon && npm ci
```

Confirm it's healthy (no config yet needed for this quick check):

```bash
cd ~/workspaces/claude-app/daemon && npm run typecheck && npm test
```

---

## 3. Configure the daemon (`daemon/env.sh`)

`env.sh` is git‑ignored, so it's per‑machine. Create `~/workspaces/claude-app/daemon/env.sh`
with your real home path and MagicDNS name:

```
export RELAYD_HOST=127.0.0.1
export RELAYD_PORT=8787
export AGENT_HOME=/Users/<YOU>
export RELAYD_ALLOWED_ROOTS=/Users/<YOU>/workspaces
export RELAYD_ADVERTISE_URL=https://<YOUR-MAC>.tailXXXX.ts.net
```

Why:
- `AGENT_HOME` + `RELAYD_ALLOWED_ROOTS` make `hedged` resolve to
  `/Users/<YOU>/workspaces/hedged-core-app` **inside** the allowlist → status `active`.
- **Do NOT set `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN`** — leaving them unset makes
  the SDK use your logged‑in Claude Code subscription. (Only set one if you prefer that.)
- `RELAYD_ADVERTISE_URL` is what the pairing QR points the phone at — set it in step 5.

Verify Claude auth once more:

```bash
claude -p "say hi"
```

---

## 4. Start the daemon & verify

```bash
cd ~/workspaces/claude-app/daemon && source env.sh && npm run dev
```

In the startup log, confirm:
```
relayd listening ... projects: [ { id: 'hedged', status: 'active' } ]
```

Health check (new terminal):

```bash
curl http://127.0.0.1:8787/healthz
```

Expect `{"ok":true,"projects":1}`. If `hedged` is `unresolved`/`rejected`: you didn't
`source env.sh`, the paths in it are wrong, or the repo isn't at
`$AGENT_HOME/workspaces/hedged-core-app`.

---

## 5. Expose over Tailscale (HTTPS)

One‑time: in the Tailscale admin console enable **MagicDNS** and **HTTPS Certificates**.

```bash
tailscale serve --bg 8787
```

```bash
tailscale serve status
```

It prints `https://<YOUR-MAC>.tailXXXX.ts.net/ → http://127.0.0.1:8787`. Make sure that
HTTPS URL matches `RELAYD_ADVERTISE_URL` in `env.sh` (restart the daemon if you changed it).
Plain `http://` to a non‑localhost host is blocked by iOS/Android — the Tailscale HTTPS URL
avoids that, and WebSockets (`wss://…`) are proxied too.

---

## 6. Pair the phone

```bash
cd ~/workspaces/claude-app/daemon && source env.sh && npm run pair
```

Scan the QR in the app (or paste the printed `pocketcode://pair?...` link). Then: projects
list → tap `hedged` → prompt → watch it stream.

---

## 7. Keep it running

Quick (survives terminal close + sleep) while you're still testing:

```bash
cd ~/workspaces/claude-app/daemon && source env.sh && caffeinate -dimsu npm run dev
```

A proper always‑on service (LaunchAgent with auto‑restart + reboot survival) is **Sprint 4
(S4‑01)** — ask for it when you're ready to leave this Mac unattended.

---

## Updating later

```bash
cd ~/workspaces/claude-app && git pull
```

```bash
cd ~/workspaces/claude-app/daemon && npm ci
```

Then restart the daemon (`source env.sh && npm run dev`). Re‑run `tailscale serve status`
only if the URL changed.

---

## Troubleshooting

- **`hedged` not `active`** → `source env.sh` first; check `AGENT_HOME`/`RELAYD_ALLOWED_ROOTS`
  and that `~/workspaces/hedged-core-app` exists.
- **Task errors with auth/billing** → `claude` not logged in, or a stray `ANTHROPIC_API_KEY`
  is set. Unset it; re‑verify `claude -p "say hi"`.
- **Phone can't reach it** → `RELAYD_ADVERTISE_URL` must equal the `tailscale serve` URL and
  the phone must be on the same tailnet.
- **"would expose the daemon publicly"** → `RELAYD_HOST` is `0.0.0.0`; keep it `127.0.0.1`
  (with `tailscale serve`) or use the Tailscale IP.
