# Provisioning Firebase App Distribution — hedged (STAGING ONLY)

One-time setup so PocketCode's **Upload to testers** (S3-02) actually ships the APK. The
daemon runs the upload on the **always-on (agent) Mac**, so the secret lives there and most
of this is done there. Pilot is **staging only** — the daemon's guardrail refuses the
production Firebase project, so nothing here can touch prod.

> Legend: **[You · browser]** Google-account action (Claude can't do these),
> **[You · agent Mac]** run on the always-on Mac, **[Claude · dev]** a non-secret config
> edit Claude can make from the dev machine.

---

## 0. Before you start
- A Google account with access to create/own the Firebase project.
- The always-on Mac has `firebase-tools` installed: `firebase --version` (if missing:
  `npm i -g firebase-tools`).
- Know hedged's **staging applicationId** (the Android package for the `staging` flavor,
  e.g. `com.hedged.core.staging`). Check `hedged-core-app/android/app/build.gradle`
  (`productFlavors { staging { applicationId ... } }`). The Firebase Android app you register
  **must use this exact package name**, or the upload won't match the app.

---

## 1. Create the Firebase project + Android app  **[You · browser]**
1. <https://console.firebase.google.com> → **Add project** → name it so it maps to
   **`hedged-core-staging`** (this string goes in the manifest as `firebaseProject`; it must
   match the project **id**, shown in Project settings).
2. In the project: **Add app → Android**.
   - **Android package name** = hedged's **staging** applicationId (from step 0).
   - Finish. You can **skip** downloading `google-services.json` — App Distribution only needs
     the App ID and the APK (that file is for FCM/Analytics, not distribution).
3. **Project settings → General → Your apps**: copy the **App ID**. Format:
   `1:1234567890:android:abcdef0123456789`. ← you'll need this.

## 2. Create a tester group  **[You · browser]**
1. **Run → App Distribution** (left nav) → if prompted, **Get started**.
2. **Testers & Groups → Add group** → add yourself / testers.
3. Note the group **alias** (the short lowercase name, e.g. `internal`), **not** the display
   name. The daemon passes `--groups <alias>`.

## 3. Create a service account + key  **[You · browser, then agent Mac]**
1. Google Cloud console → same project → **IAM & Admin → Service Accounts → Create**.
2. Grant role **Firebase App Distribution Admin** (`roles/firebaseappdistro.admin`).
3. **Keys → Add key → JSON** → download it.
4. Move the JSON **only onto the always-on Mac** (e.g. `~/secrets/fad-staging.json`).
   **Never commit it, never copy it to the dev Mac.** It is the one real secret here.
   ```bash
   mkdir -p ~/secrets && chmod 700 ~/secrets
   mv ~/Downloads/<that-key>.json ~/secrets/fad-staging.json
   chmod 600 ~/secrets/fad-staging.json
   ```

## 4. Point the daemon at the key  **[You · agent Mac]**
Add to the git-ignored `daemon/env.sh` on the always-on Mac:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/secrets/fad-staging.json"
```
Do **not** run `firebase login` — the service account is the auth (CLAUDE.md: never
interactive login in scripts).

## 5. Fill the manifest  **[Claude · dev]** — or do it yourself
`daemon/config/projects/hedged.yaml` → `distribution.firebaseAppDistribution`:
```yaml
    firebaseProject: hedged-core-staging        # the project id from step 1
    appId: 1:1234567890:android:abcdef0123456789 # the App ID from step 1
    groups:
      - internal                                 # the group ALIAS from step 2
```
These are **not secrets**. Paste the **App ID** + **group alias** to Claude and it'll patch +
commit this for you; then `git push` (dev) → `git pull` (agent Mac). The
`uploadCmd` and `serviceAccountEnv` are already correct and need no change.

## 6. Verify the toolchain (optional sanity check)  **[You · agent Mac]**
With a staging APK already built (e.g. from a PocketCode build), confirm the CLI + creds work
outside the app:
```bash
source daemon/env.sh
firebase appdistribution:distribute \
  <path-to>/app-staging-release.apk \
  --app "1:1234567890:android:abcdef0123456789" \
  --groups "internal" \
  --release-notes "provisioning test"
```
A release should appear in the Firebase console and testers get a mail/notification.

## 7. Restart the daemon  **[You · agent Mac]**
```bash
cd ~/workspaces/pocket-code && git pull
cd daemon && source env.sh && caffeinate -dimsu npm run dev   # or your usual start
```

## 8. Ship from the phone
Build & ship screen → run a build → **Upload to testers**. Watch the upload log in the same
stream; on success you get the **Firebase link**. (Upload/push/build are biometric-gated, S3-07.)

---

## Troubleshooting (the daemon returns a clear 409 for each)
- *"Firebase appId is still a placeholder"* → step 5 not done (or not pulled/restarted).
- *"tester group is still a placeholder"* → step 5 `groups` still `<...>`.
- *"service-account credential env GOOGLE_APPLICATION_CREDENTIALS is not set"* → step 4, and
  restart so the daemon picks up `env.sh`.
- *"uploading to Firebase project 'hedged-core-production' is forbidden"* → guardrail working
  as intended; the pilot is staging only. Keep `firebaseProject: hedged-core-staging`.
- CLI error about the app/package → the registered Android package name ≠ the staging
  applicationId (step 0/1).

## Guardrail (do not change during the pilot)
`hedged.yaml` → `guardrails.forbidFirebaseProjects: [hedged-core-production]` must stay. It's
the last line of defence that keeps distribution staging-only.
