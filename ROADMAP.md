# Roadmap

> Place at `docs/ROADMAP.md`.
> Dates are relative to project start (Week 1 = first week of Sprint 0). Adjust to real dates.

## Vision

From a phone, a Flutter developer can ask Claude Code to change a project, review exactly what changed, and put a working build in testers' hands, without opening a laptop.

## Milestones

| Milestone | Target | What the user can do | Exit test |
|-----------|--------|----------------------|-----------|
| **M0: Pipeline proven** | End of Week 1 | Build and upload an Android APK by one script on the Mac; reach the Mac from the phone | `scripts/distribute.sh` works over SSH; phone reaches Mac over Tailscale |
| **M1: Remote chat** | End of Week 2 | Start and follow a Claude Code task from the phone | Task streams live on mobile data; reconnect replays events |
| **M2: Safe review** | End of Week 3 | Approve actions, review diffs, commit and push a branch | Approve a command, review a diff, push a `claude/*` branch |
| **M3: Ship to testers** | End of Week 4 | One tap from reviewed code to an APK in Firebase with release notes | Tester receives the build |
| **M4: Unattended** | Week 5 | Leave the Mac running for a week | No manual restarts; uptime alert tested |

## Now / Next / Later

### Now (MVP, Weeks 1-5)

- Mac hardening: dedicated user, Tailscale, power settings
- Daemon: Agent SDK runner, worktrees, event log, WebSocket replay
- App: pairing, task stream, approvals, diff and code viewer
- Android build and Firebase App Distribution upload
- FCM notifications, biometric gates, crash recovery

### Next (after MVP, about Weeks 6-10)

- **CI fallback:** GitHub Actions builds when the Mac is offline
- **Multi-repo dashboard:** status per project, recent tasks, cost per task
- **Task templates:** saved prompts such as "fix lints", "add tests for X", "upgrade dependencies"
- **Better review:** comment on a diff line and send it back to Claude as a follow-up
- **PR flow:** open a pull request from the app (`gh pr create`) with Claude's summary

### Later (only if needed)

- iOS builds, ad hoc signing, TestFlight
- Voice prompts
- Second device or second Mac
- Local-network fallback when Tailscale is down
- Share the tool with teammates (needs per-user credentials and a security review; Anthropic terms require each user to use their own credentials)

## Decision gates

| When | Question | If yes | If no |
|------|----------|--------|-------|
| End of Sprint 0 | Does Remote Control already cover 80% of what you need? | Pause the app; keep `distribute.sh` and use Remote Control | Continue to Sprint 1 |
| End of Sprint 0 | Does the Team plan's API credit cover the daemon? | Use it | Create an API key with a spend limit |
| End of Sprint 3 | Is the Mac reliable for builds? | Keep builds local | Move builds to CI |
| End of Sprint 4 | Will anyone else use this? | Run a security review and add per-user auth | Keep single-user |

## Dependencies and external factors

| Dependency | Why it matters | Owner |
|------------|----------------|-------|
| Anthropic Agent SDK and credential policy | Daemon cannot run without a valid credential method | Re-check monthly |
| Claude Team admin settings | Remote Control may need admin enablement | Team admin |
| Firebase project and service account | Required for uploads | You |
| Tailscale | Only remote access path | You |
| Flutter and Android toolchain versions on the Mac | Pin to avoid broken builds after updates | You |

## Success metrics

- Time from "prompt sent" to "APK in testers' hands": under 15 minutes for a small change.
- Tasks completed from the phone without opening the laptop: over 80% in the first month.
- Manual Mac interventions (restart, unlock): at most 1 per month.
- Cost per task shown in the app; monthly spend within budget set in the Anthropic Console.
- Zero secrets found in logs or repos during the security checklist.

## Risks and response

| Risk | Trigger | Response |
|------|---------|----------|
| Credential policy changes | Anthropic announcement or auth errors | Switch to API key; fall back to Remote Control |
| Mac unreliable | More than 1 outage per month | Add UPS and uptime alert; move builds to CI |
| Scope creep | Requests for editing or iOS before MVP exit | Park in Later list |
| Rate limits | Frequent stalls | Default to a cheaper model; cap concurrency |
