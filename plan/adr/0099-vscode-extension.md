# ADR 0099 — The VS Code extension

Status: accepted, 2026-10-22; decisions 1, 2, 10, 14, 22, 23, 29, 31, 33, and 34 changed by ADR 0100. It adds plan 15 and milestones M4.1 to M4.3, and changes plan 01 §1.2 and §1.4, plan 04 §4.2, plan 06 §6.2 and §6.4, plan 08 §8.7, and plan 12 §12.1.

The product owner asked (2026-10-22): "Is it possible to develop a vscode extension for this kvman app", then "go ahead". kvman is already a local server, a web app, and a program that another program can drive (`kvman --pipe`, plan 14 §14.2). So a VS Code extension is a shell like the desktop app: it runs the same `kvman`, and shows kvwebui in a VS Code view.

Two facts shaped the questions:
- VS Code puts every webview's content in a frame sandboxed without `allow-popups`, and the flags pass down to frames inside it. A kvman page framed in a VS Code view can't open a new window: kvai's sign-in link, kvcoder's MCP sign-in (`window.open`), and the links in a chat do nothing there. VS Code catches link clicks only in its own document, not in a frame inside it.
- kvman sends no framing policy today, so any website can frame `http://127.0.0.1:<port>`. kvwebui's calls from that frame are same-origin and pass the Host and Origin checks (plan 04 §4.2).

Decisions 1 to 9 were asked with alternatives and mockups. Decisions 10 to 38 are the smallest way to carry them out; the product owner may overrule any of them.

## Decisions

### Asked

1. **kvman shows in VS Code's secondary side bar** (chosen over an editor tab, and over opening the system's browser from VS Code). The extension contributes a view container to the secondary side bar, which VS Code supports from 1.106, with one webview view that frames kvwebui. kvwebui runs at side-bar width: its nav is the icon rail (plan 06 §6.2), and kvcoder's artifact panel lies over the conversation (plan 08 §8.7).
2. **kvwebui hands a new window to its parent when asked** (chosen over an "Open in browser" button only, and over not framing kvman at all). It is a host-neutral rule of kvwebui (plan 06 §6.2): a page opened with `?open=parent` posts each new window's address to its parent window, and the parent opens it. kvwebui doesn't know about VS Code.
3. **The extension runs the `kvman` on the PATH, and offers to install it** (chosen over bundling Node and kvman in the extension, and over the PATH with no offer). The extension stays small and runs the same kvman version as the terminal on the shared home.
4. **kvman starts on first use, stops with the window that started it, and another window starts it again** (chosen over starting with VS Code, and over stopping when the view closes). The window that started kvman owns it; other windows join it (the `joined` line). When the owner closes, kvman stops, and another window that needs kvman then starts it again.
5. **The view opens the window's first folder** (chosen over asking in a multi-root window, and over opening every folder). A window with no folder opens Home.
6. **Local folders only in this phase** (chosen over running kvman on the remote machine). In a window whose first folder isn't a local folder (SSH, WSL, Dev Containers, Codespaces, a virtual folder), the view says so and starts nothing.
7. **Published to the VS Code Marketplace and Open VSX** (chosen over the Marketplace only, and over a `.vsix` on the GitHub Release only). Open VSX reaches Cursor, VSCodium, and Windsurf.
8. **The view only** (chosen over an "Add to kvman chat" editor item, and over opening kvman's file links in a VS Code editor). Nothing in kvman's API is added for the extension.
9. **kvman's pages may be framed only by kvman's own origin, local pages, and VS Code** (chosen over kvwebui checking its parent's origin, and over leaving framing open). Every answer of the listener carries `Content-Security-Policy: frame-ancestors 'self' http://127.0.0.1:* http://localhost:* vscode-webview: vscode-file:` (plan 04 §4.2). A website can no longer frame kvman, so it can't use kvman's UI from a frame, and kvwebui's handoff (decision 2) reaches only a local page or a VS Code webview.

### The smallest way to carry them out

10. **The package** is `packages/vscode`, private for npm (never published there), at the root version. Its VS Code identity is the publisher `ibndeif`, the name `kvman`, the display name "kvman", and `engines.vscode` `^1.106.0`. Its license is MIT, and its icon is the desktop app's (ADR 0038, 48).
11. **The import wall.** `packages/vscode` imports `vscode` (provided by VS Code at run time; only its types are a dependency), `zod`, and Node built-ins. It imports no kvman package: it runs `kvman` as a program and calls its HTTP API, as the desktop app does (ADR 0038, 34). The webview's own page imports nothing.
12. **The build.** The extension is bundled into one CommonJS file with Vite, which the repository already has, with `vscode` and the Node built-ins external, so the `.vsix` holds no `node_modules`. The page is TypeScript compiled by `tsc` beside its HTML, as the desktop page is (ADR 0038, 46). `pnpm vscode:package` writes the `.vsix`.
13. **The dependencies**, each pinned exactly when its milestone starts, and listed in this ADR then: `@types/vscode` at the engine floor (1.106), since its version may not be newer than `engines.vscode`; `@vscode/vsce` and `ovsx` at their latest stable versions (M4.3).
14. **What the extension contributes**:
    - a view container `kvman` in the secondary side bar, titled "kvman", with the icon, holding the webview view `kvman.view`;
    - the commands `kvman.open` (shows and focuses the view), `kvman.openInBrowser` (opens the view's current workspace in the system's browser), and `kvman.install` (decision 19);
    - the setting `kvman.path` (string, default `kvman`): the program the extension runs.
    The extension starts when the view is first shown or one of its commands runs, not when VS Code starts.
15. **Finding the folder.** The first folder of `vscode.workspace.workspaceFolders` is used when its URI's scheme is `file`. With no folder, kvman starts in the user's home folder, so its start workspace is Home (plan 01 §1.2). A first folder of another scheme is decision 6's case.
16. **Starting kvman**: `<kvman.path> --pipe --no-open` in that folder, with VS Code's environment. On Windows the program is started through `cmd.exe /d /s /c`, since npm installs `kvman` there as a `.cmd` file that Node doesn't start directly; on Linux and macOS it is started directly. Each OS's branch is tested.
17. **The version first.** Before its first start in a window, the extension runs `<kvman.path> --version`. A kvman older than the first version that has the M4.1 changes (the constant `MINIMUM_KVMAN_VERSION`, set when M4.1 is released) shows "kvman `<version>` is older than this extension needs (`<minimum>`)." with "Update kvman" (decision 19, with `kvman@latest`).
18. **No kvman.** A `--version` that can't start the program (it isn't found) shows "kvman isn't installed." with "Install kvman".
19. **Installing** runs `npm i -g kvman --no-fund --loglevel=error` (plan 01 §1.2) as a VS Code task named "Install kvman", so its output shows in a terminal. An exit code of 0 starts kvman. Any other code shows "kvman couldn't be installed. The terminal shows why." with "Try again"; a code of 127, or a missing `npm`, shows "npm wasn't found. Install Node.js 24, then try again." with a link to `https://nodejs.org`.
20. **The lines** are read as the desktop app reads them (plan 14 §14.2), each into a typed shape with zod; an unknown shape is decision 27's case.
    - **`trust`** opens a modal VS Code message in the extension's language: "These extensions are not part of kvman and can do anything you can:", each `name@version (source)`, and "Run them?", with the button "Run them". "Run them" answers `{ "trust": true }`; closing the message answers `{ "trust": false }`.
    - **`failed`** shows, in the view, "kvman could not start", the Problem's `code` and `message`, and the hint for its code (the desktop app's four: `KVMAN_RUNNING`, `PORT_IN_USE`, `EXTENSION_INVALID`, `VALIDATION_FAILED`; otherwise the log file's path), with "Try again" and "Show the log", which opens `<home>/logs/kvman.log` in an editor. `<home>` is `KVMAN_HOME`, else `~/.kvman`, as kvman finds it.
    - **`running`** frames the line's `url` with `&open=parent` added; this window owns that kvman.
    - **`joined`** does the same, without owning it.
    - **`restarting`** changes nothing: kvwebui waits for kvman as it does in a browser. A `running` line with another port moves the frame to its `url`.
21. **While kvman starts**, the view shows "Starting kvman…" with a progress mark, in the side bar's own colours.
22. **The frame.** The view's page holds one `<iframe>` with `allow="clipboard-read; clipboard-write"` and no `sandbox` attribute of its own; the view's sandbox applies. The page's policy is `default-src 'none'; frame-src http://127.0.0.1:<port>; script-src 'nonce-<nonce>'; style-src <webview source>`. The view keeps its page when hidden (`retainContextWhenHidden`), so hiding the side bar doesn't reload kvwebui.
23. **A new window.** The page passes on a `message` from the frame only when its `source` is the frame's window and its `origin` is `http://127.0.0.1:<port>`. The extension reads it as `{ kind: 'kvman.open', url }` with zod, and opens only an `http:` or `https:` address with `vscode.env.openExternal`; anything else is dropped (ADR 0038, 50).
24. **Downloads** are VS Code's own behaviour for a webview; the extension adds nothing.
25. **Closing a window that owns kvman** closes kvman's input in the extension's `deactivate`, and waits for nothing: kvman stops by itself when its input closes, within its stop sequence's own budget (plan 02 §2.14), and also when VS Code ends the extension host first, since the pipe then closes. No process tree is ended.
26. **Starting again.** In a window that doesn't own kvman, when the view is shown or one of the commands runs, the extension calls `kernel.health.get` on the port it knows. When nothing answers, it runs decision 16 again: it then owns the new kvman, or joins one that another window started first. kvwebui reconnects by itself on the same port.
27. **A kvman that ends by itself** while this window owns it, or a line that can't be read, shows "kvman stopped unexpectedly." with "Start again" and "Show the log". After an unreadable line the extension closes kvman's input first, as decision 25 does.
28. **A remote window** (decision 6) shows "kvman works on local folders only for now." and runs nothing. The extension's kind is `ui`, so it runs on the person's own machine in every window.
29. **"Open in browser"** opens `http://127.0.0.1:<port>/?workspace=<id>` for the view's start workspace with `vscode.env.openExternal`; with no kvman running, it starts kvman first.
30. **The extension's text** follows VS Code's display language: Arabic when `vscode.env.language` starts with `ar`, otherwise English. The manifest's titles are in `package.nls.json` and `package.nls.ar.json`; every other text is a key of the package's own `en` and `ar` catalog (CLAUDE.md §5). kvwebui inside the view keeps its own `kernel.language`.
31. **kvwebui keeps its own theme** (`kvwebui.theme`) inside the view; the extension's own states (decisions 18 to 21, 27, 28) use VS Code's theme variables.
32. **The listener's policy** (decision 9) is sent on every answer, JSON included, as one fixed value. `http://127.0.0.1:*` and `http://localhost:*` keep kvcoder's `url` artifact working, which frames a preview kvman on another port (plan 08 §8.7). `vscode-file:` is there because VS Code's workbench, the view's top ancestor, is loaded from it.
33. **kvwebui's handoff** (decision 2, plan 06 §6.2):
    - A page opened with `?open=parent` keeps that for the tab in `sessionStorage`, as it keeps the workspace, and removes the parameter from the URL. A page opened without it doesn't hand over.
    - While it hands over, a click or middle click on any link with `target="_blank"` and an `http:` or `https:` address, in any extension's component, is caught at the document before the browser acts, and posted to `window.parent` as `{ kind: 'kvman.open', url }`.
    - A script that opens a window calls the injected `kvman.open(url)` (plan 06 §6.4) instead of `window.open`: it opens a new tab (`noopener`), or, while kvwebui hands over, posts the same message. It returns `'opened'` or `'blocked'` (`'blocked'` when the browser refused the tab).
    - kvcoder's MCP sign-in calls `kvman.open` (plan 08 §8.7), so it works in the view. `@kvman/sdk/web` types `open`, which needs a changeset.
34. **The view at side-bar width** is kvwebui as it is below 768 px (plan 06 §6.2) and kvcoder below 48 rem (plan 08 §8.7); nothing is added for it.
35. **Tests.** The extension's logic is tested without VS Code: vitest with a fake of the `vscode` module and a fake `kvman` program that speaks the lines (the desktop app's fake, ADR 0038, 36); the view's page with vitest and `happy-dom`. No test drives a real VS Code in this phase: `@vscode/test-electron` downloads VS Code, which breaks the no-network rule (plan 12 §12.1). M4.2 starts by checking by hand, in VS Code 1.106 on Linux, that decision 9's policy lets the view frame kvman and that a website can't. If either fails, it is asked.
36. **The release.** The version tag (ADR 0026, 8) also runs a job that builds the `.vsix`, attaches it to the draft GitHub Release (ADR 0038, 52), and publishes it to the Marketplace (`vsce publish`) and Open VSX (`ovsx publish`) at once, as npm is. The tokens are the repository secrets `VSCE_PAT` and `OVSX_PAT`; the product owner creates the publisher `ibndeif` on both and keeps the tokens.
37. **The user guide** gets a page: installing the extension, the install offer, where the view is, local folders only, and how it shares `~/.kvman` with the terminal and the desktop app.
38. **Secrets and the listener.** The extension never reads `secrets.json`, keeps no state of its own besides VS Code's for the view, and logs nothing. It adds no route, token, or header to kvman; decision 9 is kvman's own header, the same for every client.

### Found while building M4.1 and M4.2

These are the smallest way to carry out the decisions above; the product owner may overrule any of them.

39. **The version rule** (decision 17): a kvman passes when it is at least `MINIMUM_KVMAN_VERSION` (`0.4.7`, the first release with M4.1), or at least as new as the extension itself. So a build of the repository, whose kvman and extension share the root version, always runs with its own kvman before that release.
40. **Chromium's Local Network Access check.** Chromium refuses a public page's frame of `127.0.0.1` by itself, before kvman's policy is read. M4.1-H2 turns that check off in its browser, so that it tests kvman's policy, which also guards browsers without such a check. VS Code's view isn't refused by it (the by-hand check, M4.2).
41. **The manifest and the folder VS Code loads.** The workspace package is `@kvman/vscode`, since `kvman` is the CLI's npm name. The VS Code manifest is `packages/vscode/manifest.json`; `pnpm build` writes `packages/vscode/dist/extension` with the bundle, the page's script and stylesheet, the manifest as `package.json` (name `kvman`, at the root version), its `package.nls` files, the icons, the README, and the license. VS Code loads that folder, and `vsce` packages it.
42. **The install task's type** is contributed as the task definition `kvman`, which VS Code wants for a task an extension makes.
43. **`@vscode/vsce-sign`'s install script doesn't run** (`allowBuilds` `false`): its binary for the system comes as its own package, and the extension isn't signed.
44. **Vite reaches only the build config**: it is a devDependency of `packages/vscode`, and its wall lists `vite` beside `vscode` and `zod`; a devDependency is importable only from tests and top-level configs.
45. **Texts the decisions left open**: "Installing kvman… The terminal shows its progress." while the task runs, "Get Node.js" as the link to `https://nodejs.org`, "Try again" after a failed install or a missing npm, and "kvman ran into a problem: {message}" for a VS Code call that fails (such as opening a log that isn't there).
46. **The relay drops a message without a source.** A frame that holds no page has no window; a message whose source is `null` never counts as the frame's.
47. **The by-hand check** (decision 35) ran on the VS Code installed on the developer's machine, 1.141.2, as 1.106 wasn't at hand, driven through VS Code's debugging port with its own profile and kvman home.
48. **`kvman.path` is a machine setting** (found by a security review). A folder's own `.vscode/settings.json` can't name the program the extension runs; only the person's user settings can, so opening a cloned repository never runs a program it chose.

### Asked while building M4.3

49. **M4.3 makes the tag's draft GitHub Release itself** (asked 2026-10-22; chosen over finishing M3.3 first, and over publishing to the stores only). M3.3, which was to add the desktop installers and the draft release to `release.yml`, isn't finished. The `vscode` job creates the tag's draft release when none exists, or adds to it, attaches the `.vsix`, and publishes it to both stores. M3.3's installer jobs add to the same draft when it is finished; it stays open. The job needs `contents: write`, for itself alone.

## Plan changes

- `15-vscode.md` is new: what the extension is, what it contributes, starting and joining, the view, closing and starting again, text, publishing, and security.
- `01-overview.md` §1.2: the VS Code extension as the third way to run kvman. §1.4: the `packages/vscode` row, and Vite for its bundle.
- `04-http-api.md` §4.2: the `frame-ancestors` policy on every answer.
- `06-kvwebui.md` §6.2: `?open=parent` and the handoff of new windows. §6.4: `kvman.open`.
- `08-kvcoder.md` §8.7: the MCP sign-in opens its address with `kvman.open`.
- `12-testing.md` §12.1: the VS Code layers.
- `13-milestones.md`: M4, with M4.1 (framing and the handoff), M4.2 (the extension), and M4.3 (publishing).
- `README.md`: plan 15 and this ADR.
- `CLAUDE.md` §3: the VS Code extension under Running, and the `vscode` row of the import walls.
