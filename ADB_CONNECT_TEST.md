# S5-00 — adb-over-tailnet connection test (runbook)

> Hands-on test for [`scripts/adb-connect.sh`](scripts/adb-connect.sh). Goal: prove `flutter run` +
> hot reload work to the **real phone over cellular** before we build the daemon `RunService`.
> This is the gate for Feature 1 (see [`LIVE_RUN_PLAN.md`](LIVE_RUN_PLAN.md) §8, task S5-00).
>
> Run everything on the **always-on Mac** unless a step says "on the phone".
> Keep secrets out: nothing here hardcodes your tailnet IP — you pass it each time as `<phone-ip>`.

---

## 1. Prereqs (once)

Confirm the tools are on PATH and the phone is on the tailnet:

```bash
adb version && flutter --version && tailscale status
```

In the `tailscale status` output, find your phone's tailnet IP (the `100.x.x.x` next to the phone's
name). That's `<phone-ip>` everywhere below.

---

## 2. On the phone — enable Wireless debugging (do this on Wi-Fi)

1. **Settings → Developer options → Wireless debugging → ON**
2. Tap **"Pair device with pairing code"** — note the **IP:pairingPort** and the **6-digit code**.
3. **realme / ColorOS extra (important):** Settings → Battery → disable optimization / allow
   background for **Tailscale** (and later the boot-helper app), and enable **Autostart**.
   ColorOS aggressively kills adb in the background otherwise.

---

## 3. Pair (one-time per phone)

```bash
scripts/adb-connect.sh pair <phone-ip> <pairing-port>
```

Enter the 6-digit code when prompted. Pairing persists until factory reset.

---

## 4. Connect (on Wi-Fi first)

On the phone's main **Wireless debugging** screen, read the **IP & Port** — this is the *connection*
port (different from the pairing port). Then:

```bash
scripts/adb-connect.sh connect <phone-ip> <connection-port>
```

- A dialog may appear on the phone — **"Allow wireless debugging on this network?"** → **Allow**.
- ✅ **Check 1:** the `flutter devices` output lists your phone.

---

## 5. The real test — over cellular

1. **On the phone: turn Wi-Fi OFF**; keep mobile data + Tailscale on.
2. Reconnect (uses the cached port — no port needed):

```bash
scripts/adb-connect.sh connect <phone-ip>
```

- ✅ **Check 2:** still connects on cellular and `flutter devices` still lists the phone.

---

## 6. Hot reload test (cd into the Flutter app first)

```bash
cd ~/workspaces/hedged-core-app && flutter run -d <phone-ip>
```

Once running, press **`r`** (hot reload), **`R`** (hot restart), **`q`** (quit).

- ✅ **Check 3:** switch to the app on the phone — the change shows. Note the **"Reloaded in …ms"**
  value and how laggy it feels.

---

## 7. Link quality

```bash
tailscale status
```

- ✅ **Check 4:** on the phone's line, is it **direct** or **relay**? Relay = expect lag.

---

## What to report back

1. Device listed by `flutter devices`?
2. Cellular connect worked (Wi-Fi off)?
3. Hot reload latency + did the app actually update on the phone?
4. Direct or relay?

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `adb connect` → **Connection refused** | ColorOS killed adbd, or the port changed. On the phone: Wireless debugging **off → on**, re-read the port, then `connect <phone-ip> <new-port>` once (the script caches it). |
| Phone not in `flutter devices` but in `adb devices` | Restart adb server: `adb kill-server && adb start-server`, reconnect. |
| Port keeps changing after reboot | Expected on Android 14+ (random port). Pass the current port once; the script caches it. The daemon will auto-discover it later. |
| `connect` with no port just hangs / sweeps forever | The sweep is slow over a relay. Read the port off the phone and pass it explicitly. |
| "Allow on this network?" never appeared | Toggle Wireless debugging off/on while the phone is on the network you'll use. |
| Laggy hot reload | Check `tailscale status` for **relay** — a direct peer is much faster. |

---

## Environment overrides (optional)

- `POCKETCODE_ADB_HOST` — default host, so you can omit `<phone-ip>`.
- `POCKETCODE_ADB_SWEEP` — sweep range `LOW-HIGH` (default `30000-44000`).
- `POCKETCODE_ADB_SWEEP_TIMEOUT` — per-port probe timeout seconds (default `1`).
