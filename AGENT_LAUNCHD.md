# S4-01 — Run the daemon under launchd (survive crash + reboot)

Until now the daemon ran under a manual `caffeinate … npm run dev`, so a crash or reboot left
nothing running (and broke pairing). This sets it up as a **LaunchAgent** with `KeepAlive` so it
restarts on crash and comes back after a reboot.

**Why a LaunchAgent (user session), not a LaunchDaemon (boot):** the daemon authenticates with
the **logged-in Claude Code subscription** (Keychain), which only exists in the user's session.
So it must run as the agent user — and for reboot survival you enable **automatic login** for
that user.

Files (committed in the repo):
- `scripts/relayd-launchd.sh` — launcher: sets PATH, loads `daemon/env.sh`, runs the daemon.
  Self-locates the daemon dir, so it works wherever the repo lives.
- `scripts/com.pocketcode.relayd.plist` — the LaunchAgent (template with `__REPO__` / `__HOME__`).

---

## Install (on the agent Mac)

1. **Stop the manual daemon** if one is running (avoid two on `:8787`):
   ```bash
   pkill -f 'tsx watch src/index.ts' 2>/dev/null; pkill -f caffeinate 2>/dev/null
   ```

2. **Make the launcher executable:**
   ```bash
   chmod +x ~/workspaces/pocket-code/scripts/relayd-launchd.sh
   ```

3. **Install the plist** with your real paths filled in (adjust the repo path if different):
   ```bash
   REPO="$HOME/workspaces/pocket-code"
   sed -e "s|__REPO__|$REPO|g" -e "s|__HOME__|$HOME|g" \
     "$REPO/scripts/com.pocketcode.relayd.plist" \
     > "$HOME/Library/LaunchAgents/com.pocketcode.relayd.plist"
   ```

4. **Load it:**
   ```bash
   launchctl unload "$HOME/Library/LaunchAgents/com.pocketcode.relayd.plist" 2>/dev/null
   launchctl load -w "$HOME/Library/LaunchAgents/com.pocketcode.relayd.plist"
   ```

5. **Verify:**
   ```bash
   launchctl list | grep com.pocketcode.relayd        # shows a PID + exit code 0
   sleep 3 && curl -s http://127.0.0.1:8787/healthz    # -> {"ok":true,"projects":1}
   tail -n 40 "$HOME/Library/Logs/pocketcode-relayd.log"
   ```

## Test survival (the acceptance criteria)

- **Crash restart:** kill it and confirm launchd brings it back within ~10s:
  ```bash
  pkill -f 'tsx watch src/index.ts'; sleep 12; curl -s http://127.0.0.1:8787/healthz
  ```
- **Reboot:** enable **System Settings → Users & Groups → Automatic login** for the agent user,
  reboot, and after it logs in confirm `/healthz` responds without any manual start.

## Day-to-day

- **Logs:** `tail -f ~/Library/Logs/pocketcode-relayd.log`
- **Restart after a `git pull`:** `npm run dev` (tsx watch) usually hot-reloads; to force it:
  ```bash
  launchctl kickstart -k "gui/$(id -u)/com.pocketcode.relayd"
  ```
- **Stop permanently:** `launchctl unload -w ~/Library/LaunchAgents/com.pocketcode.relayd.plist`
- **Pairing:** still one-time via `npm run pair`; now that the daemon survives restarts, a paired
  phone stays paired across crashes/reboots.

## Notes

- Set a stable **`RELAYD_DOWNLOAD_SECRET`** in `daemon/env.sh` so APK download links survive
  restarts (otherwise a fresh per-process secret invalidates old links).
- System no-sleep (so the box stays reachable) is **pmset** (S0-02), separate from this. This
  LaunchAgent only handles process survival; builds self-caffeinate (S3-08).
- Node/toolchain path: the launcher prepends Homebrew paths and sources `~/.zprofile`. If the
  log shows `npm: command not found`, add your node location to `PATH` at the top of
  `scripts/relayd-launchd.sh`.
