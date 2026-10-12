#!/bin/bash
# PocketCode daemon (relayd) launcher for launchd (S4-01).
#
# Runs in the user's LOGIN session on purpose: the daemon uses the logged-in Claude Code
# subscription (Keychain), which a system LaunchDaemon can't reach. For reboot survival, enable
# automatic login for the agent user so this LaunchAgent loads after a restart.
#
# launchd provides a minimal environment, so we make the toolchain available and load the
# per-machine config before handing off to the daemon.

# Common toolchain locations (Homebrew etc.). Adjust if node lives elsewhere.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$PATH"
# Best-effort: pull in the login-shell PATH (nvm/fvm/asdf, `brew shellenv`, …).
[ -f "$HOME/.zprofile" ] && . "$HOME/.zprofile" 2>/dev/null
[ -f "$HOME/.profile" ] && . "$HOME/.profile" 2>/dev/null

# Resolve the daemon dir relative to this script (<repo>/scripts/.. -> <repo>/daemon), so the
# plist needs no hard-coded repo path beyond pointing at this file.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../daemon" || exit 1

# Per-machine config: paths, advertise URL, RELAYD_DOWNLOAD_SECRET, Claude creds. Git-ignored.
# Set a stable RELAYD_DOWNLOAD_SECRET in env.sh so APK download links survive restarts.
[ -f env.sh ] && . ./env.sh

# Hand off to the daemon (replaces this process). Builds self-caffeinate (S3-08); keeping the
# Mac awake/reachable is pmset's job (S0-02). Use `npm run dev` (tsx watch, picks up pulls) or
# switch to the built daemon: `npm run build && exec node dist/index.js`.
exec npm run dev
