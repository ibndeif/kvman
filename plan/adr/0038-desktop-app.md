# ADR 0038 — The desktop app

Status: accepted, 2026-10-07. It adds plan 14 and milestones M3.1 to M3.3, and changes plan 01 §1.2 and §1.4, plan 02 §2.9 and §2.14, and plan 12 §12.1.

The product owner asked (2026-10-07): "I want a downloadable desktop app for windows, mac and linux where the user can download and install. the app home screen should be a screen where the user selects the workspace to continue using the app". Until now kvman was only an npm package started from a terminal (plan 01 §1.2), which needs Node, npm, and a terminal.

kvman is already a local server and a web app, so the desktop app is a window, an installer, and an answer to everything the terminal did: the trust question, the start folder, Ctrl+C, and the printed URL.

Decisions 1 to 18 were asked with alternatives, the screens with mockups and the shell with measured sizes. Decisions 19 to 40 are the smallest way to carry them out; the product owner may overrule any of them.

## Decisions

### Asked

1. **A downloadable app for Windows, macOS, and Linux**, installed like any other app, on a machine with nothing else installed.
2. **The shell is Tauri** (chosen over Electron). Measured on Linux x64 with kvman 0.3.3: both ship Node 24 (29 MB to download, 121 MB installed), kvman with its dependencies (24 MB, 242 MB), and npm (about 5 MB, 19 MB). Electron adds about 100 MB to the download and 250 MB or more on disk; Tauri adds about 5 to 10 MB and 10 to 20 MB. So about 65 MB against 160 MB to download, and 400 MB against 650 MB installed. The price, accepted: kvwebui runs in three system webviews (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux), and the repository gains Rust.
3. **The kernel doesn't move.** The app runs the same `kvman` program as a child process with a bundled Node 24, and its window loads `http://127.0.0.1:<port>` as any browser does. The listener and its Host and Origin checks are unchanged (plan 04 §4.2).
4. **The home screen is drawn by the shell, not by kvwebui** (the owner first chose a kvwebui page, then changed it when asked how kvwebui would know it runs in the app). kvwebui doesn't change at all.
5. **The home screen shows on every launch** (over only when there is a choice, and over preselecting the last workspace).
6. **A row opens or removes.** Home and every open workspace; a click continues into it; every row but Home has a remove button (`kernel.workspace.close`), as kvwebui's own picker has. "Open a folder…" uses the system's folder dialog (over rows that only open).
7. **The home screen returns only at the next launch.** After a choice the same window becomes the app, and kvwebui's picker switches workspaces from then on (over an app menu item, and over a home screen that stays open with a window per workspace).
8. **The home screen uses kvman's language and kvwebui's theme** (over the system's colours, and over the system's language too). It reads `kernel.language` and `kvwebui.theme`; when the running preset has no `kvwebui.theme`, it follows the system's light or dark (over always light).
9. **Closing the window quits kvman** (over staying in the tray, and over asking the first time). Jobs and schedules are rows in SQLite and go on at the next launch (plan 02 §2.3).
10. **The trust question is a system dialog at start**, listing the versions not accepted yet, with Accept and Quit (over accepting automatically, and over starting without them).
11. **npm is bundled** beside the bundled Node (over using the system's npm, and over no npm installs in the app).
12. **The app updates itself**, with Tauri's updater, from GitHub Releases, after the person agrees (over a notice with a link, and over nothing).
13. **The installers are not code-signed in this phase** (over signing macOS and Windows, and over macOS only). macOS won't open the app until the person allows it in System Settings, and Windows shows a SmartScreen warning. Updates are still verified, with the updater's own key.
14. **A release builds five installers**: macOS `.dmg` for Apple silicon and for Intel, a Windows x64 `.exe` installer, and Linux x64 `.deb` and AppImage (over adding `.rpm` and arm64 for Linux and Windows, and over three).
15. **Same home, same `web` mode, no new kernel mode** (over a `desktop` mode, and over a home of its own). The app and a terminal `kvman` share `~/.kvman`, and `kvman` in a terminal is unchanged.
16. **kvman stops when its input closes**, behind a new flag (over a `kernel.stop` command, and over both). No signal reaches a child process from a windowed app on Windows, and a kvman whose shell died stops too, so nothing is left holding the lock.
17. **The same flag carries JSON lines** (over parsing the terminal's English sentences): `kvman --pipe` writes one JSON object per line and reads the trust answer as a line. Any program can drive kvman this way.
18. **The app joins a kvman that already runs on the home** (over refusing with a message, and over joining with a notice). Closing the window then leaves that kvman running, since the app didn't start it. **The dialogs before the kernel runs use kvman's language**: the `trust` and `failed` lines carry it (over the system's language).

### The smallest way to carry them out

19. **The lines** (plan 14 §14.2). kvman writes `trust`, `running`, `joined`, `restarting`, and `failed`; the shell writes `{ "trust": true }` or `{ "trust": false }`. With `--pipe`, nothing else is written to stdout; stderr, the log file, the exit codes, and the signals are as before. The shapes are the CLI's own and are not exported by `@kvman/sdk`.
20. **The answer and the closed input.** Only `{ "trust": true }` accepts; any other line, and an input that closes while the question is open, declines, as any answer but `y` does (ADR 0009, 48). `--pipe` asks even with no terminal, since the pipe is how it asks; `--yes` still skips the question. An input that closes while kvman starts doesn't kill the start: kvman finishes starting, then stops.
21. **How the app starts kvman**: `kvman --pipe --no-open`, in the user's home folder, so the start workspace is Home (plan 01 §1.2) and no flag for it is needed. It gives no `--preset`, so the default preset runs, and no `--port`: the webview keeps kvwebui's `localStorage` per origin, and an origin includes the port, so a port that changed at every launch would forget the tab's state. A taken port fails `PORT_IN_USE` and is shown (decision 25).
22. **The bundled Node's folder is added last to kvman's `PATH`.** A developer's own Node and npm still win, as they do for a terminal kvman; a machine without them finds the bundled ones. The agent's shell is unchanged.
23. **A second launch of the app focuses the window** that is open, and starts nothing.
24. **While kvman starts, the window shows the name "kvman" and a progress mark, with no sentence**, in the system's colours: the language and the theme aren't known until kvman answers.
25. **A start that fails** shows a dialog with the Problem's code and message and a hint for its code, the four the terminal has (`KVMAN_RUNNING`, `PORT_IN_USE`, `EXTENSION_INVALID`, `VALIDATION_FAILED`; ADR 0009, 49) and the log file's path otherwise. Its one button quits. A declined trust question quits with no second dialog.
26. **The home screen's details.** A folder under the user's home folder is shown with `~`. Removing asks nothing, since closing a workspace keeps its data (plan 02 §2.6). The folder dialog starts at the user's home folder, and the chosen folder is opened and entered at once. A call that fails shows its Problem's translated text above the list, from `GET /api/locales/:lang`.
27. **The window.** Its title is "kvman" and it opens at 1280 by 800. It never opens a second window: a request for a new window, and a navigation to any other origin, opens in the system's browser. A download is saved in the person's Downloads folder.
28. **Closing waits for kvman.** The app closes kvman's input, hides the window, and waits for the process to end, at most 15 seconds (the stop sequence's own budget is 10, plan 02 §2.14). After that it ends the process tree: SIGKILL to the group on Linux and macOS, `taskkill /PID <pid> /T /F` on Windows.
29. **A kvman that ends by itself** while the window is open shows a dialog that names `logs/kvman.log`, with one button that quits. The app doesn't start it again.
30. **A restart** (`kernel.restart`, ADR 0024) keeps the window. A `trust` line during it shows the trust dialog again; a decline there fails the start, and the undo of the last preset edit applies as in a terminal (ADR 0024, 5). A `running` line with another port moves the window to the new address.
31. **The update is offered on the home screen**, as a line with the new version and "Install and restart". It is downloaded and verified first; only then is kvman stopped, the update installed, and the app started again. A check that fails shows nothing, and the next launch checks again. A `.deb` install can't replace itself, so its button is "Download" and opens the release page.
32. **macOS gets an ad-hoc signature**, since Apple silicon runs no unsigned code at all; it is still not notarized (decision 13). The Windows installer installs for the current user, so installing and updating need no administrator.
33. **What the app holds**: the official Node 24 build for its system, at one exact version checked against nodejs.org's checksums, that build's npm, and the `kvman` package with its production dependencies, built from the repository at the release's version, with `better-sqlite3`'s binary for that system and that Node.
34. **The package** is `packages/desktop`, private (never published to npm), at the root version. The app's identifier is `com.ibndeif.kvman`. It imports nothing of kvman's: not the kernel, the SDK, the CLI, or an extension. It runs `kvman` as a program and calls its HTTP API.
35. **Dependencies**, each pinned exactly at its latest stable version when M3.2 starts, and listed here then: `@tauri-apps/cli` and `@tauri-apps/api` (npm); `tauri`, `tauri-build`, `tauri-plugin-dialog`, `tauri-plugin-updater`, `tauri-plugin-single-instance`, `tauri-plugin-opener`, `serde`, `serde_json`, and `reqwest` (Rust). The home screen's page is plain TypeScript and CSS, with no framework.
36. **Tests and gates.** The shell's logic is tested without a window: its Rust side against a fake `kvman` program that speaks the lines, its page against a fake of the Rust side. `pnpm desktop:check` runs `cargo fmt --check`, `cargo clippy` with warnings as errors, and `cargo test`; the M3 milestones pass it besides the five gates, which cover the package's TypeScript. There is no automated test that drives the real window in this phase: it would add WebdriverIO and a driver per system.
37. **Rust follows the code rules** (CLAUDE.md §5) where they apply: no `unsafe`, no `unwrap` or `expect` outside tests, files of at most 300 lines, no workarounds. Every line from kvman and every HTTP answer is read into a typed shape, and an unknown shape is a failure.
38. **The shell's own text** is a catalog with `en` and `ar` inside the package. Any other `kernel.language` shows English, as a missing key does in kvwebui (plan 02 §2.11). Its colours are kvwebui's values (plan 06 §6.4; ADR 0037, 3).
39. **Removing the app** is the system's own way, and it leaves `~/.kvman`. `kvman uninstall` (ADR 0031) is unchanged and is for the npm install.
40. **The release.** The tag that publishes to npm (ADR 0026, 8) also builds the five installers, each on a runner of its own system, since Tauri doesn't build across systems. Each runner first runs the bundle it built with no window: it starts the bundled kvman with `--pipe --yes` on a new home, reads the `running` line, calls `kernel.health.get`, closes the input, and expects exit 0. The installers and the updater's `latest.json` are attached to the GitHub Release of that tag. The updater's private key is the repository secret `TAURI_SIGNING_PRIVATE_KEY`, with `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; the product owner makes and keeps it, and an app can't be updated without it. This is still the only CI (ADR 0026, 10).

### Asked while building M3.2

41. **A `failed` line with no language shows its dialog in English** (asked; chosen over the system's language, which needs the `sys-locale` crate). It replaces "the system's" in decision 25's dialog and in plan 14 §14.4, step 5. It happens only for a failure before kvman has read its preset, such as `KVMAN_RUNNING`.
42. **A download whose name is taken gets a number** (asked; chosen over the system's save dialog for every download, and over replacing the old file): `report.pdf` is saved as `report (1).pdf`, then `report (2).pdf`. Nothing in the Downloads folder is replaced.
43. **At a restart, the trust dialog's first button is "Don't run"** (asked; chosen over "Quit" in both places). It declines, kvman undoes the last preset change and runs as before, and the window stays open. At the app's launch the button is "Quit", since there is nothing to go back to. A decline at a restart with no backup to restore is a failed start, with its dialog (decision 25).
44. **A line the shell can't read ends the session** (the smallest way to carry out decision 37): it shows the dialog of a kvman that ended by itself, and stops kvman as closing the window does.
45. **A port that changed at a restart** moves a window that is past the home screen to the `running` line's `url`; on the home screen only the port is taken, for the next choice. A restart on the same port moves nothing.

## Plan changes

- `14-desktop.md` is new: the `--pipe` flag, what the app holds, starting, the home screen, the window, updates, installers, and text and security.
- `01-overview.md` §1.2: the `--pipe` flag, and the desktop app as the second way to run kvman. §1.4: the `packages/desktop` row.
- `02-kernel.md` §2.9: the trust question over a pipe. §2.14: the lines at start step 5 and 11, the stop by a closed input, and the `restarting` line.
- `12-testing.md` §12.1: the desktop layers, and the release's run on three systems.
- `13-milestones.md`: M3, with M3.1 (`kvman --pipe`), M3.2 (the app), and M3.3 (installers, updates, and the release).
- `CLAUDE.md` §3: the desktop app under Running, and the `desktop` row of the import walls. §5: Rust.
