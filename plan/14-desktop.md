# 14 — The desktop app

Every decision here is in ADR 0038.

## 14.1 What it is

The desktop app is kvman for a person with no terminal: one download, installed like any other app, on Windows, macOS, and Linux. It is a shell around the same program:

- The shell is Tauri. It owns a window, the dialogs, and the updates, and holds no kvman logic.
- kvman runs as the shell's child process, on a Node 24 the app brings with it, started with `--pipe` (§14.2).
- The window loads `http://127.0.0.1:<port>`, as a browser does. Nothing in the kernel, the HTTP API, or kvwebui knows about the app, and `kernel.health.get` still says `web`.
- The app and a terminal `kvman` share the home folder (`KVMAN_HOME`, else `~/.kvman`).

`packages/desktop` is private, at the root version, with the identifier `com.ibndeif.kvman`. It imports nothing of kvman's.

## 14.2 `kvman --pipe`

`--pipe` is a flag of a run (§1.2), for a program that starts kvman and talks to it through its standard input and output. The desktop app is the first one.

**What kvman writes.** One JSON object per line on stdout, and nothing else there. Stderr, `logs/kvman.log`, the exit codes, and the signals are as without the flag.

| Line | When |
|---|---|
| `{ "kind": "trust", "language", "versions": [{ "name", "version", "source" }] }` | Start step 5 (§2.14), when a version isn't accepted yet and `--yes` wasn't given. kvman waits for the answer. |
| `{ "kind": "running", "url", "port" }` | Start step 11, in place of the printed URL: the start workspace's URL, and the port. Again after each restart. |
| `{ "kind": "joined", "url", "port" }` | A kvman already runs on this home and took this folder over (§1.2). kvman then exits 0. |
| `{ "kind": "restarting" }` | A restart begins (§2.14), in place of `kvman is restarting…`. |
| `{ "kind": "failed", "language"?, "problem": { "code", "message", "params"? } }` | A start failed, with its Problem (§5). kvman then exits 1. |

- `language` is the stored `kernel.language`: the global value, else the preset's, else `en`. A `failed` line has none when kvman fails before start step 3 has finished, as with `KVMAN_RUNNING`.
- A second kvman that can't hand over (another preset or mode, or a kvman that is still starting or doesn't answer) writes `failed` with `KVMAN_RUNNING`.
- A start that is undone and started once more (§2.14) writes no `failed` line for the first failure; `kernel.health.get` has `rolledBack`, as in a terminal.

**What kvman reads.** One JSON object per line on stdin.

- `{ "trust": true }` accepts the versions of the open `trust` line, and they are remembered (§2.9). `{ "trust": false }`, any other line, and an input that closes while the question is open decline: the start fails `EXTENSION_INVALID`.
- With `--pipe`, kvman asks even with no terminal. `--yes` accepts without a `trust` line.
- A line that arrives when no question is open is ignored.

**The closed input stops kvman.** Once kvman runs, an input that closes starts the stop sequence (§2.14), and kvman exits 0, as for the first Ctrl+C. An input that closes while kvman starts, with no question open, lets the start finish, and kvman then stops. So a program that ends, for any reason, never leaves its kvman behind.

`--pipe` doesn't change `--no-open`, and `kvman uninstall` doesn't take it (`VALIDATION_FAILED`).

## 14.3 What the app holds

- The official Node 24 build for its system, at one exact version, checked against nodejs.org's checksums when the app is built.
- That build's npm.
- The `kvman` package with its production dependencies, built from the repository at the release's version, with `better-sqlite3`'s binary for that system and that Node. So the bundled presets and extensions are the same as `npm i -g kvman` installs.

The app adds the bundled Node's folder to the end of kvman's `PATH`. Extension installs (§2.9) and kvbuilder's programs (§9) then find `npm` on any machine, and a person's own Node and npm come first when they have them.

## 14.4 Starting

1. **One app.** A second launch focuses the window that is open, and starts nothing.
2. **The window opens** at 1280 by 800, titled "kvman". While kvman starts it shows the name "kvman" and a progress mark, with no sentence, in the system's colours.
3. **kvman starts**: the bundled Node runs the bundled `kvman --pipe --no-open`, in the user's home folder, so the start workspace is Home. The app gives no other flag: the preset is the default, and the port is `kernel.port`.
4. **A `trust` line** opens a system dialog, in the line's `language`:

   ```
   ┌─ kvman ───────────────────────────────────┐
   │  These extensions are not part of kvman   │
   │  and can do anything you can:             │
   │                                           │
   │    • kvnotes@1.2.0   (npm:1.2.0)          │
   │    • my-tool@0.1.0   (path:~/dev/my-tool) │
   │                                           │
   │  Run them?                                │
   │                                           │
   │                  [ Quit ]   [ Accept ]    │
   └───────────────────────────────────────────┘
   ```

   Accept answers `{ "trust": true }`. Quit, and closing the dialog, answer `{ "trust": false }`; the app then quits with no second dialog.
5. **A `failed` line** opens a dialog, in the line's `language`, or in English when it has none (ADR 0038, 41): "kvman could not start", the Problem's `code` and `message`, and a hint. The hint is one of four, for `KVMAN_RUNNING`, `PORT_IN_USE`, `EXTENSION_INVALID`, and `VALIDATION_FAILED`, and otherwise names `<home>/logs/kvman.log`. Its one button, Quit, quits the app.
6. **A `running` line** shows the home screen (§14.5). The app owns this kvman and stops it when the window closes (§14.6).
7. **A `joined` line** shows the same home screen, on the kvman that already runs. The app doesn't own that kvman: closing the window quits the app and leaves kvman running.

## 14.5 The home screen

The shell draws it, in the app's window, on every launch:

```
┌─ kvman ───────────────────────────── ─ □ ✕ ┐
│                                            │
│  Choose a workspace                        │
│                                            │
│  🏠 Home             ~                     │
│  📁 clinic-notes     ~/work/clinic-notes  ✕│
│  📁 kvman-v2         ~/ibndeif/kvman-v2   ✕│
│                                            │
│  [ Open a folder… ]                        │
│                                            │
└────────────────────────────────────────────┘
```

- **The list** is `kernel.workspace.list`: Home first, shown as "Home", then each open workspace's name and folder. A folder under the user's home folder is shown with `~`.
- **A click on a row** continues: the window loads `http://127.0.0.1:<port>/?workspace=<id>`, and kvwebui starts in that workspace (§6.2). The same window is the app from then on; the home screen returns at the next launch, and kvwebui's own picker switches workspaces meanwhile.
- **The remove button**, on every row but Home, runs `kernel.workspace.close` and reads the list again. It asks nothing: a closed workspace keeps its data and comes back when its folder is opened again (§2.6).
- **"Open a folder…"** opens the system's folder dialog at the user's home folder. The chosen folder is opened with `kernel.workspace.open`, and the window continues into it at once.
- **A call that fails** shows its Problem's translated text (`<namespace>.errors.<CODE>` from `GET /api/locales/:lang`) above the list, and the list stays.
- **Language.** The text follows `kernel.language`, read with `kernel.settings.list`: Arabic for `ar`, right to left, and English for any other language.
- **Colours.** kvwebui's light or dark colours (§6.4), chosen by `kvwebui.theme` from the same query: `light`, `dark`, or the system's for `system`. A preset with no `kvwebui.theme` follows the system.
- **An update** that is ready to install shows as a line above the title (§14.7).

The shell's calls to kvman carry the Host `127.0.0.1:<port>` and no `Origin`, so they pass the listener's checks (§4.2). The page itself never calls kvman.

## 14.6 The window

- **Links.** The window never opens a second window. A request for a new window, and a navigation to any origin but kvman's, opens in the system's browser.
- **Downloads.** A file download (§4.1) is saved in the person's Downloads folder, under its own name. A name that is taken there gets a number, `report (1).pdf`, then `report (2).pdf`; nothing is replaced (ADR 0038, 42).
- **A restart** (`kernel.restart`, §2.14) keeps the window, and kvwebui waits for kvman as it does in a browser. A `trust` line during it opens the trust dialog again, with "Don't run" in place of Quit: it answers `{ "trust": false }`, that start fails, the undo of the last preset edit applies (§2.14), and the window stays (ADR 0038, 43). A `running` line with another port moves a window that is past the home screen to that line's `url`; the home screen only takes the new port.
- **A line the shell can't read** (not JSON, or not one of the five shapes) is treated as a kvman that ended by itself, below, and kvman is stopped (ADR 0038, 44).
- **Closing the window quits kvman.** The app closes kvman's input, hides the window, and waits for the process to end, at most 15 seconds. After that it ends the process tree (SIGKILL to the group on Linux and macOS, `taskkill /PID <pid> /T /F` on Windows), and the crash invariants hold at the next start (§12.2). Then the app quits. On a joined kvman the app quits at once.
- **A kvman that ends by itself** while the window is open opens a dialog: "kvman stopped unexpectedly", naming `<home>/logs/kvman.log`. Its one button, Quit, quits the app.

## 14.7 Updates

- At each launch the app asks `https://github.com/ibndeif/kvman/releases/latest/download/latest.json` for the newest version, while kvman starts. A check that fails shows nothing; the next launch checks again.
- A newer version shows on the home screen as "kvman `<version>` is available." with the button "Install and restart". Continuing into a workspace leaves it for the next launch.
- "Install and restart" downloads the update and verifies its signature with the public key in the app. Only then does the app stop the kvman it owns (§14.6), install the update, and start again. A download or a signature that fails shows "The update could not be installed." and changes nothing.
- A `.deb` install can't replace itself: its button is "Download", and opens the release's page in the browser.
- The key pair is the updater's own. Its private half is the repository secret `TAURI_SIGNING_PRIVATE_KEY`, with `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

## 14.8 Installers and the release

| System | Installer |
|---|---|
| macOS, Apple silicon | `.dmg` |
| macOS, Intel | `.dmg` |
| Windows x64 | `.exe` installer, for the current user, with no administrator |
| Linux x64 | `.deb` and AppImage |

- **Not code-signed in this phase.** macOS opens the app only after the person allows it in System Settings, and Windows shows a SmartScreen warning; the install guide shows both. The macOS app has an ad-hoc signature, which Apple silicon needs to run anything.
- **The release.** The version tag that publishes to npm (ADR 0026, 8) also builds each installer on a runner of its own system. Each runner first runs what it built with no window: the bundled Node starts the bundled `kvman --pipe --yes` on a new home, the step reads the `running` line, calls `kernel.health.get`, closes the input, and expects exit 0. Then the installers, their signatures, and `latest.json` are attached to the GitHub Release of that tag.
- **Removing the app** is the system's own way, and it leaves the home folder. `kvman uninstall` (§1.2) is for the npm install.

## 14.9 Text and security

- **Text.** The shell's text is a catalog inside the package, with `en` and `ar`, and its styles are logical CSS.
- **The listener is untouched** (§4.2). The app adds no route, no token, and no header, and kvman still listens only on 127.0.0.1.
- **kvwebui gets nothing from the shell.** The page loaded from kvman's origin has no access to the shell's functions; only the shell's own page, the home screen, has, and only to what it shows.
- **Secrets** stay in `secrets.json` (§2.8). The shell never reads it, and keeps no log and no state of its own.
