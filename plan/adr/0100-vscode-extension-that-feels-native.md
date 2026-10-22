# ADR 0100 — A VS Code extension that feels native

Status: accepted, 2026-10-22. It changes ADR 0099 (decisions 1, 2, 10, 14, 22, 23, 29, 31, 33, and 34), plan 06 §6.2 and §6.4, plan 08 §8.6 and §8.7, plan 15, and plan 13 (milestones M4.4 to M4.6).

The product owner installed the extension of ADR 0099 and said (2026-10-22): "the vscode extension gives a bad user experience in vscode I want it to be like Kilo Code or Roo Code". The view framed the whole web app, with its top bar, nav rail, workspace picker, chat list, and status bar, in a side bar about 300 px wide. Roo Code and Kilo Code are made for that width: one column of conversation under a header with the task's title and cost, approvals inline, a send box with the model under it, icon buttons in VS Code's own view title bar, VS Code's colors, and edits shown as diffs in editor tabs.

Decisions 1 to 8 were asked with alternatives and mockups. Decisions 9 to 30 are the smallest way to carry them out; the product owner may overrule any of them.

## Decisions

### Asked

1. **A compact kvwebui inside VS Code's chrome** (chosen over a chat app of the extension's own, and over polishing the framed web app). kvwebui gets a host-neutral embedded mode: one page, full-bleed, without its frame. kvcoder's chat is reused as it is, at a narrow width. kvwebui still knows nothing about VS Code, and the VS Code shell holds no product concept.
2. **Edits open as diff tabs.** An edit's card and its approval offer "Open diff".
3. **File paths in the chat open in the editor.**
4. **"Add to kvman chat"**, from the editor and the file explorer.
5. **kvman lives in the primary side bar, under its own activity bar icon** (chosen over the secondary side bar of ADR 0099, 1). The person can drag it to the secondary side bar.
6. **The side bar uses VS Code's theme** (chosen over kvwebui's own colors): the host sends its colors and fonts, and the embedded kvwebui takes them.
7. **The view title bar holds generic buttons** (chosen over New chat and History there): Pages, Settings, and Open in browser. New chat and History are kvcoder's own buttons, in its compact header. A preset without kvcoder still gets a sensible bar.
8. **"Open diff" shows the whole file**: while an edit waits for approval, the file as it is against the file with the edit applied, computed by a read-only kvcoder query with kvcoder's own edit logic; after it ran, VS Code's own Git diff of the file against `HEAD`. **"Add to kvman chat"** puts the path and lines and the selected code in the send box (chosen over the path only, and over an attachment). **VS Code 1.95 and newer** (chosen over 1.106, which the secondary side bar needed).

### The smallest way to carry them out

**kvwebui (plan 06)**

9. **`?embed=parent` replaces `?open=parent`** (ADR 0099, 2 and 33, not yet released). One parameter asks for the whole embedded mode: no frame, the host's theme, new windows handed to the parent, and the host messages below. The tab keeps it in `sessionStorage` (`kvwebui.embed`), as it keeps the workspace, and the parameter is removed from the URL.
10. **The embedded page has no frame**: no top bar, nav, panel strip, or status bar. The routed page fills the frame; toasts, dialogs, and the "page not found" card are as usual. There is no workspace picker: the host chose the workspace.
11. **The host messages** (plan 06 §6.2). The page posts to `window.parent` with target origin `*` (the framing policy decides who can be the parent, plan 04 §4.2):
    - `{ kind: 'kvman.state', workspaceId }`, once booted and after each workspace switch;
    - `{ kind: 'kvman.open', url }` (ADR 0099, 33);
    - `{ kind: 'kvman.openFile', path, line? }`: an absolute path, and a line from 1;
    - `{ kind: 'kvman.openDiff', title, path, after }`: the file at `path` as it is (empty when it doesn't exist) against the text `after`;
    - `{ kind: 'kvman.openChange', path }`: the host's own diff of the file against its Git `HEAD`.
    The page takes from `window.parent` only, and only while embedded:
    - `{ kind: 'kvman.theme', dark, colors, fonts }` (decision 12);
    - `{ kind: 'kvman.pages' }`: opens the pages menu (decision 13);
    - `{ kind: 'kvman.insert', text }`: hands the text to the page's insert handlers (decision 14).
    A message of another shape is ignored.
12. **The host's theme.** `colors` is `{ background, surface, text, muted, border, primary, onPrimary, danger, warning, success }` and `fonts` is `{ sans, mono, size }`, all CSS values. kvwebui sets its own variables from them (the soft and ink shades mixed from them with `color-mix`), sets light or dark by `dark`, uses `fonts.sans` and `fonts.mono` for its text, and `fonts.size` as the root font size, so its rem-based layout follows the host's size. Until a theme comes, the embedded page uses kvwebui's own colors for `kvwebui.theme`.
13. **The pages menu**: a popover at the page's top inline-end corner listing the nav items (in nav order) and Settings and Extensions; a pick opens the page, and a press outside or Escape closes it.
14. **`kvman.host`** in the injected object (`@kvman/sdk/web`): `embedded` (a boolean), `openFile(path, line?)`, `openDiff(title, path, after)`, `openChange(path)`, and `onInsert(handler)`, which returns its removal. Outside embedded mode the three opens do nothing and no text is inserted; a component shows its host buttons only when `embedded` is true. A changeset covers the SDK and kvwebui.

**kvcoder (plan 08)**

15. **The compact header.** Below 60 rem, where the chat list is already a drawer (ADR 0093, 3), the chats bar and the conversation header are one row: an icon-only History button that opens the drawer, the title and totals, the header's buttons, and an icon-only New chat button that opens the Chat page with no chat. This is the narrow layout in a browser too.
16. **`kvcoder.file.preview.get`**, a public read-only query: `{ path, edits }` or `{ path, content }` → `{ path, after }`. `path` is resolved in the workspace as `fs` resolves it, the answer's `path` is absolute, and `after` is the file with the edits applied by `fs edit`'s own rule (or `content` for a write). An edit that wouldn't apply fails as `fs edit` would. It writes nothing.
17. **"Open diff"** shows only while embedded, on an `fs edit` or `fs write` call: on its approval it asks `kvcoder.file.preview.get` and calls `openDiff` with the title `<file name> (proposed)`; on a card whose call ran it calls `openChange`.
18. **File paths open in the editor** while embedded: the path in a read, read-files, edit, write, find, list (a file's; a folder doesn't open in an editor), and search card, and a Changes row, by an "Open" button, for a file that is there. A read opens at its first shown line, an edit at its first changed line, and a search's file at its first match. Outside embedded mode they stay text.
19. **Inserted text goes to the send box**: the open composer (a chat's, or a new chat's) appends it on a line of its own and takes the focus.

**The VS Code extension (plan 15)**

20. **The view container** is in the activity bar, `kvman`, with the kvman icon; `engines.vscode` is `^1.95.0` and `@types/vscode` is pinned at 1.95.0.
21. **The view title bar** (`menus.view/title`, for `kvman.view`): `kvman.showPages` (`$(list-unordered)`), `kvman.openSettings` (`$(gear)`), and `kvman.openInBrowser` (`$(link-external)`), each also in the Command Palette.
22. **Settings in an editor tab**: one webview panel, "kvman Settings", framing `/kvwebui/settings?workspace=<id>&embed=parent` with the same page and theme; a second press shows the open one.
23. **The workspace** the buttons use is the frame's, from its latest `kvman.state`: Open in browser opens it, and Settings frames it.
24. **The theme** is read by the view's page from VS Code's own CSS variables (`--vscode-sideBar-background`, `--vscode-editor-background`, `--vscode-foreground`, `--vscode-descriptionForeground`, `--vscode-panel-border`, `--vscode-button-background`, `--vscode-button-foreground`, `--vscode-errorForeground`, `--vscode-editorWarning-foreground`, `--vscode-testing-iconPassed`, `--vscode-font-family`, `--vscode-editor-font-family`, `--vscode-font-size`) and VS Code's theme class on `body`; it is sent on each `kvman.state` and again when VS Code's theme changes.
25. **Opening a file** shows it in the active editor group as a preview, with the cursor at the line.
26. **Opening a diff** is VS Code's diff editor: the file on disk (or an empty document when it doesn't exist) against a read-only document of `after`, titled with the message's title.
27. **Opening a change** runs VS Code's Git command `git.openChange` for the file; when it fails, VS Code shows "There's no Git change to show for this file."
28. **"Add to kvman chat"** (`kvman.addToChat`): in the editor's context menu when there is a selection, and the file explorer's for a file. A selection gives `` `<path>:<first>-<last>` `` (one line: `<path>:<line>`) and the lines in a fenced block with the editor's language; a file gives `` `<path>` ``. The path is relative to the window's folder (`vscode.workspace.asRelativePath`). It shows the view, starting kvman when needed, and sends the text once the frame has said `kvman.state`.
29. **The page messages are checked** with zod in the extension, as ADR 0099, 23 checks `kvman.open`: an `openFile`, `openDiff`, or `openChange` path must be absolute.
30. **New texts**, with `en` and `ar`: the commands' titles (Pages, Settings, Open in browser, Add to kvman chat), "kvman Settings", "There's no Git change to show for this file.", and kvcoder's "History", "New chat", "Open diff", "Open", "<file name> (proposed)", and kvwebui's "Pages".

## Plan changes

- `06-kvwebui.md` §6.2: the embedded mode and the host messages, in place of the new-windows paragraph. §6.4: `kvman.host`.
- `08-kvcoder.md` §8.6: `kvcoder.file.preview.get`. §8.7: the compact header, "Open diff", file paths that open, and inserted text.
- `15-vscode.md`: the activity bar, the title bar's buttons, Settings in a tab, the theme, the editor operations, "Add to kvman chat", and VS Code 1.95.
- `13-milestones.md`: M4.4 (kvwebui's embedded mode), M4.5 (kvcoder in a narrow host), and M4.6 (the extension feels native).
- `README.md`: this ADR.
