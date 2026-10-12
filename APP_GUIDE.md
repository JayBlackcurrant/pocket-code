# PocketCode — App Guide

> A screen-by-screen description of the PocketCode **Flutter phone app**: what the app is,
> how the whole system works, the design language, every page, and all the components on each page.
> Written from the real code in `/app/lib/src`. Keep this updated when screens change.

---

## 1. What is this app?

**PocketCode** is a phone app that lets one Flutter developer **remotely drive Claude Code running
on a spare, always-on MacBook** — from anywhere, over a private Tailscale network.

From your phone you can:

1. **Start, follow, and stop** Claude Code tasks on the Mac.
2. **Approve or deny** Claude's risky actions (shell commands, file edits) as they happen.
3. **Review the code changes** — changed-file list, per-file diff, full syntax-highlighted file.
4. **Commit, push a branch, revert a file, or discard** the whole task.
5. **Build a signed Android APK** on the Mac and **ship it to testers** with AI-written release notes.
6. **Get notified** when a task needs approval, finishes, fails, or a build is ready.

It is a **single-user personal tool** — one developer, one Mac, Android testers only. You never edit
code by hand in the app; all changes go through Claude. The phone is the remote control; the Mac does
the real work.

---

## 2. How the full system works

```
  ┌─────────────────────────┐
  │   Phone — Flutter app    │   ← this app
  │   (PocketCode)           │
  └───────────┬─────────────┘
              │  REST (dio) + WebSocket (web_socket_channel)
              │  over Tailscale — a private network, no public ports
              ▼
  ┌─────────────────────────────────────────────┐
  │   MacBook — dedicated "agent" user            │
  │   relayd  (Node + TypeScript daemon)          │
  │    ├─ Fastify REST + WebSocket API            │
  │    ├─ Agent runner (Claude Agent SDK)         │
  │    ├─ Git service (one task branch / project) │
  │    ├─ Build service (flutter build apk)        │
  │    ├─ Distribution (ship APK to testers)       │
  │    └─ SQLite event log (tasks/builds/notifs)   │
  └─────────────────────────────────────────────┘
```

**The core ideas:**

- **Pairing, not login.** The Mac prints a QR code; the phone scans it to receive a URL + a bearer
  token. The token is stored in the phone's secure storage and sent on every request. No passwords,
  no accounts.
- **Event-log-first + replay.** Everything the daemon does (task output, build log lines,
  notifications) is written to a SQLite event log with a monotonic sequence number *before* it is
  streamed. The phone streams over a WebSocket; if it drops, it reconnects and asks for everything
  `since=<last seq>`, so you never miss or duplicate a line.
- **One task per project at a time.** A task runs *in the project checkout* on a short branch named
  `claude/<slug>` (not a worktree — so the gitignored signing keys needed for builds are present).
  Starting a second task on a busy project is refused.
- **Review → commit → build, in that order.** A build is only offered once the task's changes are
  **committed**. This keeps "what you shipped" equal to "what's in git."
- **Sensitive actions are biometric-gated.** Pushing a branch, starting/retrying a build, uploading
  to testers, and "always allow" all require a Face ID / fingerprint / device-lock check on the phone.
- **Staging only.** The pilot never touches production — enforced by the daemon's guardrails.

### The typical journey through the app

```
Pair (scan QR)
   → Projects (pick a project)
      → Project (type a prompt, start a task)
         → Task (watch Claude work, approve/deny its actions, stop or continue)
            → Review (see changed files, open diffs, commit, push, discard)
               → Build & ship (run the build, edit release notes, upload to testers → link)
Notifications (inbox for approvals / done / build-ready, deep-links back into a task)
```

---

## 3. Design language, theme & shared components

The app's look mirrors the **hedged** Flutter app's theming conventions so it feels native to that
codebase: a **ThemeExtension** carries color tokens, a second one carries named typography, and the
font is **Poppins** (via `google_fonts`). Widgets never hard-code colors — they read
`context.colors.*` and `context.text.*`.

### Color tokens (`BaseColorExtension`)

Access via `context.colors.<token>`. Light and dark are both first-class.

| Token | Role | Light | Dark |
|-------|------|-------|------|
| `primary` | Primary actions, running state, links | `#4F46E5` (indigo) | `#8B87F5` (soft indigo) |
| `onPrimary` | Text/icon on primary | white | `#0B0B0F` |
| `background` | Scaffold background | `#F7F7F8` (near-white) | `#0B0B0F` (near-black) |
| `surface` | Cards, bars, composer, app-bar fills | white | `#17171C` |
| `onSurface` | Primary text | `#1A1A1A` | `#ECECEC` |
| `border` | Hairlines, card outlines | `#E3E3E8` | `#2A2A31` |
| `muted` | Secondary text, idle icons | `#6B7280` | `#9AA0AA` |
| `green` | Success, additions, "done", shipped | `#16A34A` | `#22C55E` |
| `red` | Errors, deletions, stop/deny, failed | `#DC2626` | `#EF4444` |
| `accent` | Folders, tool cards, hunk headers | `#4F46E5` | `#8B87F5` |

### Typography (`AppTypographyExtension`)

Access via `context.text.<style>`. All Poppins, colored `onSurface` by default.

| Style | Size / weight | Used for |
|-------|---------------|----------|
| `regular12` | 12 / w400 | Captions, subtitles, log text, status pills |
| `regular14` | 14 / w400 | Body text, list titles |
| `medium14` | 14 / w500 | Card titles, section labels |
| `semibold16` | 16 / w600 | List-item titles, dialog/section headings |
| `bold20` | 20 / w700 | Large headings (reserved) |

Code and diffs always use a **monospace** family at 12px — never Poppins — so columns line up.

### Recurring UI patterns

These appear across many screens; the per-page sections below reference them by name.

- **Status pill** — a rounded chip with a 15%-opacity tint of a status color and the status text in
  full color. Colors: running/queued/waiting → `primary`, done/succeeded/shipped → `green`,
  failed/cancelled → `red`, idle/unknown → `muted`.
- **Card** — `surface` fill, 1px `border` outline, 10px radius, an icon + title row, optional body.
  Used for feed items, approvals, and build-log notes.
- **Banner** — a full-width strip tinted 12% of a color (green for "done", red for errors, plain
  `surface` for "reconnecting…").
- **Bottom action bar** — a full-width `FilledButton` pinned to the bottom inside `SafeArea`
  (Stop / Retry / Continue), colored by intent (red to stop, primary to retry).
- **Composer** — a bottom input region on `surface` with a top border: an options row, optional
  attachment chips, a multiline `TextField`, and a filled circular send button (`arrow_upward`).
- **Loading / error / empty** — every data screen uses the same three-way pattern: a centered
  spinner while loading, the error text in a scrollable padding on failure, and a friendly muted
  "nothing here yet" message when empty. Lists are **pull-to-refresh** (`RefreshIndicator`).
- **Virtualized lists** — diffs, files, logs, and feeds all use `ListView.builder` and are
  size-capped, so a huge patch never janks the UI.
- **Biometric gate** — sensitive actions call `ensureBiometric(...)`; on failure a snackbar explains
  why and the action is aborted (fails closed).

### Navigation map (AutoRoute)

Cupertino-style transitions. Every route except `/pair` is behind the **PairingGuard**, which
redirects to the pairing screen until the device is paired.

| Path | Screen |
|------|--------|
| `/pair` | Pairing (QR / paste link) — the only unguarded route |
| `/` | Projects (home) — initial route |
| `/projects/:id/browse` | Project (tasks + files + composer) |
| `/projects/:id/file` | Project file viewer (read-only) |
| `/tasks/:id` | Task (live stream) |
| `/tasks/:id/review` | Review changes |
| `/tasks/:id/review/file` | Per-file diff |
| `/tasks/:id/file` | Full-file code viewer |
| `/tasks/:id/build` | Build & ship |
| `/notifications` | Notifications inbox |

---

## 4. The screens

### 4.1 Pairing — "Pair with your Mac"

**Route:** `/pair` · **File:** `pairing/ui/pairing_page.dart` · the only screen you can reach
unpaired, and the first thing a new user sees.

**Purpose:** connect the phone to the Mac daemon by reading the pairing payload the Mac prints with
`npm run pair`.

**Two modes, toggled from the top-right app-bar icon** (exactly the camera-vs-keyboard toggle):

- **Scan mode (default):** a full-screen **live camera viewfinder** (`mobile_scanner`). Pointing it
  at the QR code auto-detects and submits immediately — no button press. A caption floats at the
  bottom in white: *"Run `npm run pair` on the Mac and scan the QR code."* The app-bar action is a
  **keyboard icon** (tooltip "Paste link").
- **Paste mode:** tapping the keyboard icon flips to a manual form — a heading "Paste the pairing
  link", a 2–4 line `TextField` (hint `pocketcode://pair?url=...&code=...`), and a full-width **Pair**
  `FilledButton`. The app-bar action becomes a **QR-scanner icon** to flip back. This mode exists for
  simulators and phones without a usable camera.

**UX & states:**
- While pairing, a dark 45%-black overlay with a centered spinner covers the camera (or the Pair
  button shows an inline spinner), so you can't submit twice.
- On success → `replaceAll` to Projects (you can't go "back" to pairing).
- On failure → a snackbar with the error; you stay here to retry.

**Components:** `AppBar` with a single toggle `IconButton` (`keyboard` ⇄ `qr_code_scanner`),
`MobileScanner`, a bottom caption, a busy overlay (scan mode) / `TextField` + `FilledButton`
(paste mode).

---

### 4.2 Projects (Home) — "Projects"

**Route:** `/` · **File:** `home/ui/home_page.dart` · the first screen after pairing.

**Purpose:** list every project registered on the daemon and let you open an active one.

**App bar actions (right):**
- **Notifications** — a bell icon wrapped in a **`Badge`** that shows the unread count (hidden at 0),
  pushes the Notifications inbox.
- **Unpair** — a logout icon that clears the stored token and sends you back to Pairing.

**Body:** a **pull-to-refresh** list. Each project is a `ListTile`:
- **Title:** the project's display name (`semibold16`).
- **Subtitle:** `"<status> · <base branch>"` (e.g. `active · stag`).
- **Trailing:** a status icon — green `check_circle` when **active**, muted `pause_circle` when not.
- **Enabled only when active.** Inactive projects are greyed out and non-tappable.
- **Tap** → opens the Project screen for that project.

**States:** spinner while loading · error text on failure · *"No projects registered on the daemon."*
when the list is empty.

---

### 4.3 Project — tasks, files & the composer

**Route:** `/projects/:id/browse` · **File:** `project/ui/project_page.dart` · the hub for one
project. This is the richest screen.

**Layout, top to bottom:** app bar (project name) → a **segmented tab header** → the active tab's
content (Tasks or Files) → optional `@`-mention suggestions → the **composer** pinned at the bottom.

#### Tab header
A `SegmentedButton` with two segments: **Tasks** (`list_alt` icon) and **Files** (`folder` icon).

#### Tasks tab (default)
A pull-to-refresh list of this project's **recent tasks**, newest first. Each task tile:
- **Leading:** a `commit` icon tinted by status.
- **Title:** the branch name with the `claude/` prefix stripped (falls back to the task id).
- **Subtitle:** the status word in muted text. *(Cost is tracked on the server but intentionally
  never shown in the app.)*
- **Trailing:** a **status pill** tinted by status (green done / red failed·cancelled·discarded /
  primary running·queued·waiting / muted otherwise).
- **Tap** → opens that Task's live stream.

Empty state: *"No tasks yet — start one below."*

#### Files tab
A read-only **file browser** of the project checkout:
- A **breadcrumb bar** on `surface` showing the current path (`/` at root), with an **up-arrow**
  button that appears once you're inside a folder.
- A virtualized list of entries. **Folders** have an accent folder icon and a chevron → tap to
  descend. **Files** have a muted file icon → tap to open the read-only viewer, *or* tap the trailing
  **add/attach** icon to attach the file to your next prompt (the icon flips to a filled
  `attach_file` in primary when attached).

#### Composer (bottom, always visible)
This is the "just like Claude Code" input. Top to bottom:

1. **Options row** — three compact **icon dropdowns** (wrap to multiple rows on narrow phones):
   - **Model** (`memory` icon): *Default model · Opus · Sonnet · Haiku*. Default = let the daemon pick.
   - **Permission mode** (`tune` icon): *Auto-accept edits · Ask each tool · Plan first* — maps to
     the agent SDK modes `acceptEdits` / `default` / `plan`. Defaults to **Auto-accept edits**.
   - **Base branch** (`call_split` icon): `base: <project base>` plus every other branch, so you can
     start the task from a chosen branch.
2. **Attachment chips** — when you've attached files, each shows as a deletable `Chip` (filename only).
3. **Input row** — a 1–5 line `TextField` (hint *"Ask Claude… (type @ to attach a file)"*) and a
   filled **send** button (`arrow_upward`). While a task is being created the send button is replaced
   by a spinner.

**`@`-mention file picker:** typing `@` plus a query pops up a **suggestions panel** (max height
~180px) above the composer, listing matching file paths (filename bold, full path muted). Picking one
removes the `@query` text and adds the file as an attachment chip.

**Sending:** the prompt is sent with the chosen title, model, base branch, and permission mode; if
files are attached they're prefixed as a *"Please consider these files:"* list. On success the task
list is refreshed and the app navigates into the new Task screen.

**States:** standard loading/error/empty per tab; a snackbar surfaces any create error.

---

### 4.4 Task — live stream

**Route:** `/tasks/:id` · **File:** `tasks/ui/task_page.dart` · where you watch Claude work in real
time and make decisions.

**App bar:** title "Task" + three actions:
- **Review changes** (`rate_review`) → Review screen.
- **Build & ship** (`rocket_launch`) → Build screen.
- **Status chip** — a live status pill (running/done/failed/…) on the far right.

**Body (top to bottom):**
- **Reconnecting banner** — appears when the socket is down and the task isn't finished.
- **Error banner** — red strip with the error message.
- **Done banner** — green strip when the task finishes: *"Work finished — review the changes and
  commit, then build."* with a **Review** button. Nudges you into the right flow.
- **Approval cards** — one per parked tool call awaiting your decision (see below).
- **The feed** — a virtualized, auto-scrolling list of **feed tiles**. Empty state shows
  *"Waiting for output…"* / *"Connecting…"*.

**Feed tile kinds** (each mapped from a daemon event, styled by kind):
- **Assistant / info** — Claude's text, primary `smart_toy` icon, card style.
- **Tool** — a tool call (e.g. `Tool · Edit`) with the input shown in **monospace**, accent
  `build` icon.
- **Result** — green `check_circle`, the final result text.
- **Error** — red `error_outline` card. Also used for *"Task interrupted (daemon restarted)"* with
  the hint *"Continue below to resume where it left off."* when resumable.
- **Lifecycle** — centered muted one-liners (task started/resumed/cancelled, permission decisions).

**Approval card** (`_ApprovalCard`) — shown when Claude needs permission for a risky tool:
- Primary-tinted card, `lock_outline` icon, title *"Allow &lt;tool&gt;?"*, and a monospace summary of
  what the tool will do (capped at 4 lines).
- Three actions: **Allow once** (filled), **Always** (outlined — **biometric-gated**), **Deny**
  (red text → opens a dialog for an optional reason, "Why, or what to do instead").

**Bottom bar** (depends on state):
- **Running** → a red **Stop task** `FilledButton` (`stop` icon).
- **Terminal** (done/failed/cancelled) → a **Continue bar**: a 1–4 line `TextField`
  (*"Continue this task…"*) + a filled send button. This **resumes the same Claude session on the
  same branch** with your follow-up.

---

### 4.5 Review changes

**Route:** `/tasks/:id/review` · **File:** `review/ui/review_page.dart` · the diff-review and git
hub for a task.

**App bar:** title "Review changes" + an overflow **`PopupMenuButton`** with:
- **Commit…** — fetches a suggested commit message, opens a **commit dialog** (editable, 1–3 lines),
  and commits. A snackbar confirms with the short SHA. Committing may unlock the Build screen.
- **Push branch** — confirm dialog → **biometric gate** → pushes the task's `claude/*` branch to the
  remote; snackbar confirms the branch name.
- **Discard task** — confirm dialog ("cannot be undone") → drops the changes, deletes the branch,
  returns to Home.

**Body:** a pull-to-refresh list of changed files, split into two groups:
- **Normal files** — listed directly.
- **Generated files** — collapsed under an **`ExpansionTile`** *"Generated files (N)"* (e.g.
  `*.g.dart`, `*.freezed.dart`, `pubspec.lock`), so machine output doesn't drown the real changes.

Each **file tile**:
- **Leading:** a circular **status badge** — `A` green (added/untracked), `D` red (deleted),
  `R`/`C` accent (renamed/copied), `M` muted (modified).
- **Title:** the file path; **subtitle** shows `from <oldPath>` for renames.
- **Trailing:** `+additions` in green and `-deletions` in red, or `binary` for binary files.
- **Tap** → opens the per-file diff. **Long-press** → revert this file (with confirmation).

**States:** spinner / error text / *"No changes yet."*

---

### 4.6 Per-file diff

**Route:** `/tasks/:id/review/file` · **File:** `review/ui/diff_file_page.dart` · one file's unified
diff.

**App bar:** the filename + a **"View full file"** action (`description` icon) → the full code viewer.

**Body:** a virtualized unified diff, line by line:
- **Added** lines → green 12% background.
- **Removed** lines → red 12% background.
- **Hunk headers** (`@@ … @@`) → accent 10% background, accent text.
- **Meta** lines → muted. **Context** lines → plain `onSurface`.
- All **monospace 12px**.

A red **"Diff truncated (large file)"** banner appears at the top for very large files. Binary files
show *"Binary file — not shown"*.

---

### 4.7 Full-file code viewer

**Route:** `/tasks/:id/file` · **File:** `review/ui/code_viewer_page.dart`, rendering the shared
**`CodeView`** component. (The project browser's read-only viewer at `/projects/:id/file`,
`project/ui/project_file_page.dart`, uses the same component.)

**Purpose:** read a whole file with **syntax highlighting** and line numbers.

**`CodeView` component:**
- A right-aligned muted **line-number gutter** (auto-sized to the digit count) and the code to its
  right.
- **Token coloring** by type, with distinct light/dark palettes: keywords (violet/magenta), types
  (teal), strings (amber/orange), numbers (green), comments (muted), plain text (`onSurface`).
- Virtualized line-by-line; a red **"File truncated (large)"** banner for big files; *"Binary file —
  not shown"* for binaries.

---

### 4.8 Build & ship

**Route:** `/tasks/:id/build` · **File:** `builds/ui/builds_page.dart` · build a signed APK and
distribute it to testers.

**App bar:** title "Build & ship" + a **"New build"** (`+`) action (visible once a build is open) to
start a fresh build instead of staying on a finished one.

This screen has two phases: the **start view** (no build yet) and the **live build view**.

#### Start view — gated behind commit
A build is only offered once the task's changes are **committed**. It reads the task's review status
and shows one of:
- **Review & commit first** — if there are uncommitted changes. A card ("This task has uncommitted
  changes…") with a **Review changes** button.
- **Nothing committed yet** — if the branch has no committed changes to build. A card with an
  **Open review** button.
- **Ready to build** — a **"Run codegen first"** switch (subtitle: *"pub get + build_runner before
  the APK build"*) and a full-width **Start build** `FilledButton`. Starting is **biometric-gated**.

When the screen opens it also quietly **adopts an in-progress build** for this task if one exists — so
you watch a running build, but you're never stuck looking at a previously finished one.

#### Live build view
- **Header:** a status pill (queued/running/succeeded/failed/uploading/uploaded) + a *"reconnecting…"*
  hint when the socket drops.
- **Log:** a virtualized, auto-scrolling build log. Line kinds: **step** headers in accent,
  **success** (green check), **error** (red), **lifecycle** (muted info), and plain **log** lines in
  monospace.
- **Bottom bar**, depending on state:
  - **Building** → red **Stop build**.
  - **Failed / cancelled** → **Retry build** (biometric-gated).
  - **Succeeded** → the **release panel**.

#### Release panel (on success)
- **Release notes** — a multiline field (2–6 lines) prefilled by AI (labeled *"(from Claude)"* or
  *"(from diff)"*), with a **Regenerate** button (`auto_awesome`) to re-ask Claude.
- **Tester groups** — a comma-separated field; empty uses the project default.
- **Upload to testers** — full-width `FilledButton` (`cloud_upload`), **biometric-gated**, shows a
  spinner while uploading.

#### Uploaded panel (after shipping)
- A green **"Shipped to testers"** header, the **release link** as selectable text, and a **Copy
  link** button. If no link is returned, it points you to the Firebase console.

---

### 4.9 Notifications inbox

**Route:** `/notifications` · **File:** `notifications/ui/notifications_page.dart` · the daemon-derived
activity feed.

**Purpose:** a live inbox of events (approvals needed, task/build/upload outcomes), streamed over the
tailnet. Notifications never contain code or secrets.

**Behavior:** opening the inbox **clears the unread badge** (marks all read).

**Each tile:**
- **Leading icon + color** by kind: approval → primary `lock`, task done → green `check_circle`,
  build ready → green `rocket_launch`, shipped → green `cloud_done`, any `*Failed` → red
  `error_outline`.
- **Title** (`semibold16`) + **body** (`regular12`).
- **Trailing:** a small primary dot for unread items.
- **Tap** → deep-links into the related Task (if the notification carries a task id).

**Empty state:** *"Nothing yet."*

---

## 5. Component index (quick reference)

| Component | Where | What it is |
|-----------|-------|------------|
| QR scanner / paste toggle | Pairing | Camera viewfinder ⇄ paste-link form, toggled from the app bar |
| Notifications badge | Home app bar | Bell icon with unread count badge |
| Project tile | Home | Name + `status · base`, active/paused icon |
| Segmented tabs | Project | Tasks ⇄ Files switch |
| Task tile | Project / tasks | Branch name, status word, status pill |
| File browser + breadcrumb | Project / files | Folders, files, attach-to-prompt, up-navigation |
| Composer | Project | Model · mode · branch dropdowns, attachment chips, multiline input, send |
| `@`-mention panel | Project | File-path suggestions above the composer |
| Status pill / chip | Task, Build, Project | Tinted rounded status label |
| Feed tile | Task | Assistant / tool / result / error / lifecycle cards |
| Approval card | Task | Allow once · Always (biometric) · Deny (reason dialog) |
| Done / error / reconnecting banners | Task, Build | Full-width tinted strips |
| Stop / Retry / Continue bar | Task, Build | Bottom action bar by state |
| File tile + status badge | Review | A/D/R/C/M badge, +/- counts, tap-diff / long-press-revert |
| Generated-files expander | Review | Collapses `*.g.dart` etc. |
| Commit / Deny dialogs | Review, Task | Self-owned-controller dialogs (crash-safe) |
| Diff viewer | Per-file diff | Added/removed/hunk coloring, monospace, truncation banner |
| CodeView | Code viewer, Project file | Syntax-highlighted, line-numbered, virtualized |
| Release panel | Build | AI release notes + regenerate, tester groups, upload |
| Uploaded panel | Build | Shipped confirmation + copyable release link |
| Notification tile | Notifications | Kind icon, title/body, unread dot, deep-link |
| Biometric gate | Push, Build, Upload, Always-allow | `ensureBiometric()` — fails closed with a snackbar |

---

## 6. Cross-cutting rules the UI follows

- **Secure by default:** token in secure storage only; sensitive actions biometric-gated; nothing
  sensitive shown in notifications; **cost hidden** in the app.
- **Resilient streaming:** WebSocket with `since=<seq>` replay; reconnecting banners; crash recovery
  surfaces interrupted tasks as resumable in the feed.
- **Safe-by-flow:** build is locked until changes are committed; discard/revert/push/stop always
  confirm; dialogs own their controllers to avoid use-after-dispose crashes.
- **Big content is virtualized and capped:** diffs, files, logs, and feeds never render everything at
  once; generated files are collapsed.
- **One theme system:** all color and type comes from `context.colors` / `context.text`, light and
  dark, Poppins + monospace for code.
```
