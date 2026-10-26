# 15 — The VS Code extension

Every decision here is in ADR 0099, ADR 0100, ADR 0101, and ADR 0106.

## 15.1 What it is

The VS Code extension shows kvman in VS Code's side bar, beside the person's files, and looks like part of VS Code: one column of kvcoder's chat, VS Code's colors and fonts, buttons in VS Code's own view title bar, and edits and files opened in VS Code's editor (ADR 0100). It is a shell around the same program, as the desktop app is (§14):

- It runs the `kvman` that is on the PATH with `--pipe` (§14.2), in the window's first folder, and frames kvwebui, embedded (§6.2), in a webview view.
- Nothing in the kernel, the HTTP API, kvwebui, or kvcoder knows about VS Code, and the extension knows nothing of chats. kvman's framing policy (§4.2) and kvwebui's embedded mode and host messages (§6.2) are host-neutral.
- The extension, a terminal `kvman`, and the desktop app share the home folder (`KVMAN_HOME`, else `~/.kvman`) and its one running kvman (§1.2).

`packages/vscode` is private for npm, at the root version. Its VS Code identity is `ibndeif.kvman` ("kvman"), with `engines.vscode` `^1.95.0` (ADR 0100, 8). It imports `vscode`, `zod`, and Node built-ins, and no kvman package. Its kind is `ui`: it always runs on the person's own machine.

## 15.2 What it contributes

| Contribution | Is |
|---|---|
| View container `kvman` | In the activity bar, titled "kvman", with the kvman icon; the person may drag it to the secondary side bar |
| Webview view `kvman.view` | The view (§15.4), in that container |
| Command `kvman.open` | Shows and focuses the view |
| Command `kvman.new` | "New", first in the view's title bar (`$(add)`), shown only while the context key `kvman.canNew` is true: the frame offers it with `kvman.actions` (§6.2), and a press sends `kvman.new` (ADR 0101, 5) |
| Command `kvman.showPages` | In the view's title bar (`$(list-unordered)`): opens kvwebui's pages menu in the frame (`kvman.pages`, §6.2) |
| Command `kvman.openSettings` | In the view's title bar (`$(gear)`): opens Settings in an editor tab (§15.6) |
| Command `kvman.openInBrowser` | In the view's title bar (`$(link-external)`): opens `http://127.0.0.1:<port>/?workspace=<id>` for the frame's workspace (its latest `kvman.state`, else the start workspace) in the system's browser; with no kvman running, it starts kvman first |
| Command `kvman.addToChat` | "Add to kvman chat", in the editor's context menu with a selection and the file explorer's for a file, and on Ctrl+Alt+K (Cmd+Alt+K on macOS) while an editor has the focus (§15.6) |
| Command `kvman.install` | Installs kvman (§15.3) |
| Setting `kvman.path` | A string, default `kvman`: the program the extension runs. Its scope is `machine`, so only the person's user settings set it, never a folder's (ADR 0099, 48) |

The extension starts when the view is first shown or one of its commands runs, never when VS Code starts.

```
┌ KVMAN ────────────  ＋ ☰  ⚙  ↗ ┐ ← VS Code: New (offered by the page), Pages, Settings, Open in browser
│ ⟲  Fix the login bug           │ ← kvcoder: History, title
│    12k tokens · $0.04          │
│────────────────────────────────│
│ You: the login form fails …    │
│ ✎ Edit src/auth.ts +12 −3      │
│   [Open diff] [Deny] [Allow]   │
│ …                              │
│ [ Describe a change…         ] │
│ 📎 Claude Sonnet ▾     [Send]  │
│ 2 waiting · 12k in · $0.04     │ ← kvwebui: the status line
└────────────────────────────────┘
```

## 15.3 Starting

1. **The folder.** The first folder of the window, when its URI's scheme is `file`. A window with no folder uses the user's home folder, so the start workspace is Home (§1.2). A first folder of any other scheme (a remote or virtual folder) shows "kvman works on local folders only for now." and runs nothing.
2. **The version.** Before the first start in a window, the extension runs `<kvman.path> --version`.
   - A program that can't be started shows "kvman isn't installed." with "Install kvman".
   - A version older than the extension's own (they are released together at the root version) shows "kvman `<version>` is older than this extension needs (`<extension version>`)." with "Update kvman" (ADR 0106, 4).
3. **Installing.** "Install kvman" runs `npm i -g kvman --no-fund --loglevel=error` as a VS Code task named "Install kvman", whose output shows in a terminal; "Update kvman" runs the same with `kvman@latest`. Exit code 0 continues at step 4. A code of 127, or no `npm`, shows "npm wasn't found. Install Node.js 24, then try again." with a link to `https://nodejs.org`; any other code shows "kvman couldn't be installed. The terminal shows why." with "Try again".
4. **kvman starts**: `<kvman.path> --pipe --no-open` in the folder of step 1, with VS Code's environment. On Windows it is started through `cmd.exe /d /s /c`, since npm installs it as a `.cmd` file; on Linux and macOS it is started directly. The view shows "Starting kvman…" with a progress mark.
5. **The lines** (§14.2) are each read into a typed shape with zod.
   - **`trust`** opens a modal message in the extension's language: "These extensions are not part of kvman and can do anything you can:", each `name@version (source)`, and "Run them?", with the button "Run them". "Run them" answers `{ "trust": true }`; closing the message answers `{ "trust": false }`.
   - **`failed`** shows in the view "kvman could not start", the Problem's `code` and `message`, and the hint for its code (the desktop app's four, §14.4; otherwise `<home>/logs/kvman.log`), with "Try again" and "Show the log", which opens that log in an editor.
   - **`running`** shows the view's frame (§15.4) at the line's `url`. This window owns that kvman.
   - **`joined`**: the extension first calls `kernel.health.get` on the line's port, which has 2 seconds to answer. When it answers with a version older than the extension's, the view shows "kvman `<version>` is already running, and this extension needs `<extension version>`. Quit it, then start again." with "Start again", which starts kvman again (step 4), and "Open anyway", which frames that kvman. Otherwise (a new enough version, no version, or no answer) the line does as `running` does, and this window doesn't own that kvman (ADR 0106, 5).
   - **`restarting`** changes nothing: kvwebui waits for kvman as it does in a browser. A later `running` line of the same start at the same address keeps the frame and whether it is ready; one with another port moves the frame to its `url`. Each start (step 4) loads its frame afresh, even at the same address (ADR 0101, 8).
   - **A line that can't be read** closes kvman's input, and the view shows §15.5's "stopped" state.

## 15.4 The view

- **The page** has no padding of its own, so the frame fills the view (ADR 0101, 7).
- **The frame.** The view's page holds one `<iframe>` at the `running` or `joined` line's `url` with `&embed=parent` added (§6.2), with `allow="clipboard-read; clipboard-write"` and no `sandbox` attribute of its own. The page's policy is `default-src 'none'; frame-src http://127.0.0.1:<port>; script-src 'nonce-<nonce>'; style-src <webview source>`.
- **Kept when hidden.** The view keeps its page while the side bar is hidden (`retainContextWhenHidden`), so kvwebui isn't reloaded.
- **The frame's messages.** The page passes a `message` on to the extension only when its `source` is the frame's window and its `origin` is `http://127.0.0.1:<port>`. The extension reads each with zod (ADR 0100, 29):
  - `kvman.state` keeps the frame's workspace, and answers with the theme;
  - `kvman.actions` sets the context key `kvman.canNew` from its `new`; it is false again while no frame is ready (ADR 0101, 5);
  - `kvman.lost` starts kvman again as §15.5 says (ADR 0101, 3);
  - `kvman.open` opens an `http:` or `https:` address with `vscode.env.openExternal`;
  - `kvman.openFile` shows the file in the active editor group as a preview, with the cursor at its line;
  - `kvman.openDiff` opens VS Code's diff editor: the file on disk (an empty document when it doesn't exist) against a read-only document of `after`, titled with the message's title;
  - `kvman.openChange` runs VS Code's Git command `git.openChange` for the file; when it fails, VS Code shows "There's no Git change to show for this file."
  An `openFile`, `openDiff`, or `openChange` path must be absolute. Any other message, address, or path is dropped.
- **The theme** (ADR 0100, 24). The page reads VS Code's own CSS variables (`--vscode-sideBar-background`, `--vscode-editor-background`, `--vscode-foreground`, `--vscode-descriptionForeground`, `--vscode-panel-border`, `--vscode-button-background`, `--vscode-button-foreground`, `--vscode-errorForeground`, `--vscode-editorWarning-foreground`, `--vscode-testing-iconPassed`, `--vscode-font-family`, `--vscode-editor-font-family`, `--vscode-font-size`) and VS Code's theme class on `body`, and posts them to the frame as `kvman.theme` (§6.2) on each `kvman.state` and again when VS Code's theme changes. `surface` is the side bar's color in the view and the editor's in the Settings tab; `background` is `color-mix(in srgb, <foreground> 6%, <surface>)`, so bubbles, cards, and selected tabs show in every theme (ADR 0106, 3).
- **The extension's messages.** The page passes on to the frame only `kvman.pages`, `kvman.new`, and `kvman.insert` with a text, and only when the message's `origin` is the page's own, which is how VS Code delivers the extension's messages. No frame can claim that origin: kvman's frame and any frame inside it, such as an artifact, are at other origins (ADR 0101, 6).
- **Downloads** are VS Code's own behaviour for a webview.
- **Width.** The embedded kvwebui has no frame (§6.2), and kvcoder below 60 rem is one column with its compact header (§8.7). kvwebui keeps its own language; the extension's own states (§15.3, §15.5) use VS Code's theme variables.

## 15.5 Closing and starting again

- **Closing a window that owns kvman** closes kvman's input in the extension's `deactivate`, and waits for nothing. kvman stops by itself when its input closes (§14.2), also when VS Code ends the extension host first. No process tree is ended.
- **Starting again.** In a window that doesn't own kvman, when the view is shown, a command runs, or the frame posts `kvman.lost`, the extension calls `kernel.health.get` on the port it knows, which has 2 seconds to answer (ADR 0101, 3 and 9). When nothing answers, it starts kvman again (§15.3, step 4): it then owns the new kvman, or joins one another window started first, and the view loads the new start's frame.
- **A kvman that ends by itself** while this window owns it shows "kvman stopped unexpectedly." with "Start again" and "Show the log".

## 15.6 Settings and "Add to kvman chat"

- **Settings** opens one webview panel, "kvman Settings", in the active editor group, framing `/kvwebui/settings?workspace=<id>&embed=parent` for the frame's workspace with the same page, messages, and theme; a second press shows the open one.
- **"Add to kvman chat"** gives, for a selection, `` `<path>:<first>-<last>` `` (one line: `` `<path>:<line>` ``) and the selected lines in a fenced block with the editor's language, and, for a file, `` `<path>` ``; run with no selection and no file given, it adds the open editor's file (ADR 0101, 4). The path is relative to the window's folder (`vscode.workspace.asRelativePath`). It shows the view, starting kvman when needed, and sends `{ kind: 'kvman.insert', text }` to the frame once the frame has said `kvman.state` (§6.2), where kvcoder's open composer takes it (§8.7).

## 15.7 Text

The extension's text follows VS Code's display language: Arabic when `vscode.env.language` starts with `ar`, otherwise English. The manifest's titles are in `package.nls.json` and `package.nls.ar.json`; every other text is a key of the package's own `en` and `ar` catalog. Its styles use logical CSS.

## 15.8 Building and publishing

- **The build.** The extension is bundled into one CommonJS file with Vite, with `vscode` and the Node built-ins external, so the `.vsix` holds no `node_modules`. The view's page is TypeScript compiled by `tsc`. `pnpm build` writes `packages/vscode/dist/extension`, the folder VS Code loads: the bundle, the page's script and stylesheet, the manifest (`packages/vscode/manifest.json`, written as `package.json` at the root version), its `package.nls` files, the icons, the README, and the license (ADR 0099, 41). `pnpm vscode:package` writes the `.vsix`.
- **The release.** The version tag (ADR 0026, 8) also runs a `vscode` job that builds the `.vsix`, creates the tag's draft GitHub Release when none exists, or adds to it (§14.8, ADR 0099, 49), attaches the `.vsix`, and publishes it at once to the VS Code Marketplace (`vsce publish`) and Open VSX (`ovsx publish`), with the repository secrets `VSCE_PAT` and `OVSX_PAT`. The product owner owns the publisher `ibndeif` on both.
- **The user guide** has a page for the extension: installing it, the install offer, where the view is, local folders only, and the shared home.

## 15.9 Security

- **The listener is untouched** (§4.2) beyond its framing policy, which is kvman's own and the same for every client. The extension adds no route, no token, and no header, and kvman still listens only on 127.0.0.1.
- **kvwebui gets nothing from the extension** but the theme, the pages menu's opening, and inserted text, through the frame's messages; the extension opens only web addresses, and files and diffs by absolute path, in VS Code's own editors.
- **Secrets** stay in `secrets.json` (§2.8). The extension never reads it, keeps no state of its own, and logs nothing.
