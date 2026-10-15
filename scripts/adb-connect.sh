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
# S5-00 result (2026-10-15): the reliable transport is a FIXED port via `adb tcpip 5555`
# (set once over USB) — then the same `adb connect <host>:5555` works on Wi-Fi/cellular/both.
# Android 11+ Wireless Debugging re-randomizes its port on every network switch, and on
# ColorOS 15 an app can't auto-start the adb listener after a reboot — so re-arm is manual.
# This script therefore tries :5555 first and only parallel-scans when that misses.
#
# Usage:
#   scripts/adb-connect.sh pair    <host> <pairPort>   # one-time: pair wireless debugging
#   scripts/adb-connect.sh tcpip   <host>              # pin adbd to :5555 (needs USB attached)
#   scripts/adb-connect.sh connect <host> [port]       # connect (default command)
#   scripts/adb-connect.sh run     <host> [port]       # connect, then `flutter run`
#
#   host : the phone's Tailscale IP (100.x) or MagicDNS name. Or set
#          POCKETCODE_ADB_HOST and omit it.
#   port : adb port. Optional; if omitted the cascade tries :5555 → cached → parallel scan.
#
# Env:
#   POCKETCODE_ADB_HOST           default host if not passed as an argument
#   POCKETCODE_ADB_PORT           fixed port to try first (default 5555)
#   POCKETCODE_ADB_SWEEP          scan range "LOW-HIGH" (default 30000-44000)
#   POCKETCODE_ADB_SWEEP_TIMEOUT  per-port probe timeout seconds (default 1)
#   POCKETCODE_ADB_SCAN_PARALLELISM  concurrent probes in the scan (default 128)
#
# Safe by design: no sudo, no root, no destructive commands. Only adb/flutter.

set -euo pipefail

# Internal: a single parallel-scan probe, re-invoked by xargs. Prints the port if open.
if [ "${1:-}" = "__probe" ]; then
  __t="${POCKETCODE_ADB_SWEEP_TIMEOUT:-1}"
  if command -v nc >/dev/null 2>&1; then
    nc -z -G "$__t" -w "$__t" "$2" "$3" >/dev/null 2>&1 && printf '%s\n' "$3"
  else
    timeout "$__t" bash -c "exec 3<>/dev/tcp/$2/$3" >/dev/null 2>&1 && printf '%s\n' "$3"
  fi
  exit 0
fi

# --- config -----------------------------------------------------------------
CMD="${1:-connect}"
case "$CMD" in
  pair|tcpip|connect|run) shift ;;
  *) CMD="connect" ;;  # treat a bare host as the default `connect` command
esac

HOST="${1:-${POCKETCODE_ADB_HOST:-}}"
PORT_ARG="${2:-}"

FIXED_PORT="${POCKETCODE_ADB_PORT:-5555}"
SWEEP_RANGE="${POCKETCODE_ADB_SWEEP:-30000-44000}"
PROBE_TIMEOUT="${POCKETCODE_ADB_SWEEP_TIMEOUT:-1}"
SCAN_PARALLELISM="${POCKETCODE_ADB_SCAN_PARALLELISM:-128}"

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

# (TCP probing for the scan is done by the `__probe` self-reinvocation at the top of the file.)

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
# Fast path first (S5-00): explicit arg → fixed :5555 (adb tcpip) → cached → parallel scan.
# With a pinned :5555 you essentially never scan; the scan only matters right after a reboot.
connect_cascade() {
  require_host
  local p

  # 1) explicit port arg
  if [ -n "$PORT_ARG" ]; then
    info "trying given port ${PORT_ARG}…"
    if try_adb_connect "$HOST" "$PORT_ARG"; then cache_port "$PORT_ARG"; ok "connected on ${PORT_ARG}"; return 0; fi
    warn "given port ${PORT_ARG} did not connect"
  fi

  # 2) fixed port — the `adb tcpip 5555` convention, the common steady state
  if [ "${PORT_ARG:-}" != "$FIXED_PORT" ]; then
    info "trying fixed port ${FIXED_PORT} (adb tcpip)…"
    if try_adb_connect "$HOST" "$FIXED_PORT"; then cache_port "$FIXED_PORT"; ok "connected on ${FIXED_PORT}"; return 0; fi
  fi

  # 3) cached last-known port
  p="$(cached_port)"
  if [ -n "$p" ] && [ "$p" != "${PORT_ARG:-}" ] && [ "$p" != "$FIXED_PORT" ]; then
    info "trying last-known port ${p}…"
    if try_adb_connect "$HOST" "$p"; then ok "connected on ${p} (cached)"; return 0; fi
    warn "cached port ${p} stale (phone likely rebooted / re-randomized the port)"
  fi

  # 4) parallel scan (serial was unusable over the tailnet — S5-00)
  local low="${SWEEP_RANGE%-*}" high="${SWEEP_RANGE#*-}"
  info "parallel-scanning ${HOST} ports ${low}-${high} (needed only right after a reboot)…"
  for port in $(seq "$low" "$high" | xargs -P "$SCAN_PARALLELISM" -n1 "$0" __probe "$HOST" 2>/dev/null | sort -n); do
    info "port ${port} open — trying adb connect…"
    if try_adb_connect "$HOST" "$port"; then cache_port "$port"; ok "connected on ${port} (scanned)"; return 0; fi
  done

  die "no reachable adb port on ${HOST}. ColorOS won't auto-start adb after a reboot — re-arm first: \
plug in USB and run '$0 tcpip ${HOST}', or flip Wireless debugging ON on Wi-Fi, then retry."
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

# Pin adbd to the fixed port. Needs the phone attached over USB (ColorOS won't let an
# app do this; `adb tcpip` is a host-side command against a USB-attached device).
do_tcpip() {
  need adb; require_host
  info "pinning adbd to :${FIXED_PORT} (USB must be attached)…"
  adb tcpip "$FIXED_PORT"
  cache_port "$FIXED_PORT"
  ok "adbd now listens on :${FIXED_PORT} (until the next reboot). Unplug USB, then: $0 connect ${HOST}"
}

# Serial of the connected device as adb reports it (host:port), for `flutter run -d`.
connected_serial() {
  adb devices | awk -v h="$HOST" '$1 ~ h ":" {print $1; exit}'
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
  local serial; serial="$(connected_serial)"
  [ -n "$serial" ] || die "could not determine the device serial from 'adb devices'"
  info "launching 'flutter run -d ${serial}' (press r = hot reload, R = hot restart, q = quit)…"
  flutter run -d "$serial"
}

case "$CMD" in
  pair)    do_pair ;;
  tcpip)   do_tcpip ;;
  run)     do_run ;;
  connect) do_connect ;;
esac
