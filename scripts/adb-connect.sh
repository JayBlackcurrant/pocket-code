#!/usr/bin/env bash
#
# adb-connect.sh — S5-00 spike: connect to a remote Android phone's adb over the
# tailnet, with a connect cascade, then verify Flutter can see it.
#
# This is a THROWAWAY spike (LIVE_RUN_PLAN.md §8 S5-00). Its only job is to prove
# that `flutter run` + hot reload are usable to the real phone over cellular,
# BEFORE we build the daemon RunService. The daemon will reimplement this cascade
# in TypeScript (RunService.connectCascade); this script is for hands-on testing.
#
# No secrets in the repo: the phone's tailnet host is NEVER hardcoded here. Pass
# it as an argument or via $POCKETCODE_ADB_HOST. The last working port is cached
# OUTSIDE the repo at ~/.pocketcode/adb-last-port.
#
# Usage:
#   scripts/adb-connect.sh pair    <host> [pairPort]   # one-time: pair wireless debugging
#   scripts/adb-connect.sh connect <host> [port]       # connect (default command)
#   scripts/adb-connect.sh run     <host> [port]       # connect, then `flutter run`
#
#   host : the phone's Tailscale IP (100.x) or MagicDNS name. Or set
#          POCKETCODE_ADB_HOST and omit it.
#   port : the adb-tls-connect port shown on the phone under
#          Settings > Developer options > Wireless debugging. Optional; if omitted
#          the script tries the cached port, then sweeps a range.
#
# Env:
#   POCKETCODE_ADB_HOST   default host if not passed as an argument
#   POCKETCODE_ADB_SWEEP  port range to sweep, "LOW-HIGH" (default 30000-44000)
#   POCKETCODE_ADB_SWEEP_TIMEOUT  per-port probe timeout seconds (default 1)
#
# Safe by design: no sudo, no root, no destructive commands. Only adb/flutter.

set -euo pipefail

# --- config -----------------------------------------------------------------
CMD="${1:-connect}"
case "$CMD" in
  pair|connect|run) shift ;;
  *) CMD="connect" ;;  # treat a bare host as the default `connect` command
esac

HOST="${1:-${POCKETCODE_ADB_HOST:-}}"
PORT_ARG="${2:-}"

SWEEP_RANGE="${POCKETCODE_ADB_SWEEP:-30000-44000}"
PROBE_TIMEOUT="${POCKETCODE_ADB_SWEEP_TIMEOUT:-1}"

STATE_DIR="${HOME}/.pocketcode"
PORT_CACHE="${STATE_DIR}/adb-last-port"

# --- helpers ----------------------------------------------------------------
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m» %s\033[0m\n' "$*" >&2; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*" >&2; }
warn() { printf '\033[33m! %s\033[0m\n' "$*" >&2; }

need() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH"; }

require_host() {
  [ -n "$HOST" ] || die "no host. Pass the phone's tailnet IP/name, or set POCKETCODE_ADB_HOST."
}

cache_port() { mkdir -p "$STATE_DIR"; printf '%s\n' "$1" > "$PORT_CACHE"; }
cached_port() { [ -f "$PORT_CACHE" ] && cat "$PORT_CACHE" || true; }

# Probe a TCP port quickly (open/closed), without touching adb yet.
probe_tcp() {
  local host="$1" port="$2"
  if command -v nc >/dev/null 2>&1; then
    nc -z -G "$PROBE_TIMEOUT" -w "$PROBE_TIMEOUT" "$host" "$port" >/dev/null 2>&1
  else
    # bash /dev/tcp fallback (no nc)
    timeout "$PROBE_TIMEOUT" bash -c "exec 3<>/dev/tcp/${host}/${port}" >/dev/null 2>&1
  fi
}

# Try `adb connect host:port`; return 0 only if the device shows as connected.
try_adb_connect() {
  local host="$1" port="$2" out
  out="$(adb connect "${host}:${port}" 2>&1 || true)"
  case "$out" in
    *connected*|*already*) adb devices | grep -q "${host}:${port}.*device" ;;
    *) return 1 ;;
  esac
}

# --- the connect cascade ----------------------------------------------------
# 1) explicit port arg  2) cached last-known port  3) sweep the range.
connect_cascade() {
  require_host
  local p

  # 1) explicit
  if [ -n "$PORT_ARG" ]; then
    info "trying given port ${PORT_ARG}…"
    if try_adb_connect "$HOST" "$PORT_ARG"; then cache_port "$PORT_ARG"; ok "connected on ${PORT_ARG}"; return 0; fi
    warn "given port ${PORT_ARG} did not connect"
  fi

  # 2) cached
  p="$(cached_port)"
  if [ -n "$p" ] && [ "$p" != "${PORT_ARG:-}" ]; then
    info "trying last-known port ${p}…"
    if try_adb_connect "$HOST" "$p"; then ok "connected on ${p} (cached)"; return 0; fi
    warn "cached port ${p} stale (phone likely rebooted / re-randomized the port)"
  fi

  # 3) sweep
  local low="${SWEEP_RANGE%-*}" high="${SWEEP_RANGE#*-}"
  info "sweeping ${HOST} ports ${low}-${high} for an open adb port (slow over a relay)…"
  for ((port=low; port<=high; port++)); do
    if probe_tcp "$HOST" "$port"; then
      info "port ${port} is open — trying adb connect…"
      if try_adb_connect "$HOST" "$port"; then cache_port "$port"; ok "connected on ${port} (swept)"; return 0; fi
    fi
  done

  die "no reachable adb port on ${HOST}. Re-arm the phone (Wireless debugging ON, over Wi-Fi), then retry."
}

# --- link quality: direct vs relayed --------------------------------------
report_quality() {
  if command -v tailscale >/dev/null 2>&1; then
    info "tailscale path to ${HOST} (direct = good for hot reload, relay = laggy):"
    tailscale status 2>/dev/null | grep -i "$HOST" || warn "host not found in 'tailscale status' output"
  else
    warn "tailscale CLI not found — can't report direct vs relayed path"
  fi
}

# --- commands ---------------------------------------------------------------
do_pair() {
  need adb; require_host
  local pairPort="${PORT_ARG:-}"
  [ -n "$pairPort" ] || die "pair needs the pairing PORT from the phone's 'Pair device with pairing code' dialog"
  info "pairing with ${HOST}:${pairPort} — enter the 6-digit code when prompted…"
  adb pair "${HOST}:${pairPort}"
  ok "paired (persists until factory reset). Now run: $0 connect ${HOST} <connectPort>"
}

do_connect() {
  need adb
  connect_cascade
  info "adb devices:"; adb devices
  if command -v flutter >/dev/null 2>&1; then
    info "flutter devices:"; flutter devices || warn "flutter couldn't list the device — check 'adb devices' above"
  else
    warn "flutter not on PATH — skipping 'flutter devices'"
  fi
  report_quality
  ok "done. If the device shows above, hot reload over the tailnet should work."
}

do_run() {
  need adb; need flutter
  connect_cascade
  report_quality
  info "launching 'flutter run' on ${HOST} (press r = hot reload, R = hot restart, q = quit)…"
  flutter run -d "$HOST":* 2>/dev/null || flutter run
}

case "$CMD" in
  pair)    do_pair ;;
  run)     do_run ;;
  connect) do_connect ;;
esac
