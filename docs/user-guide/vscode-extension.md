# The VS Code extension

This page is for people who use VS Code, Cursor, or VSCodium and want kvman beside their files. When you finish, you will know how to install the extension, where kvman shows, and how it shares kvman with your other windows.

The extension shows kvman in VS Code's side bar, under its own **KV** icon in the activity bar, and looks like part of VS Code: VS Code's colors and fonts, one column of chat, buttons in the view's title bar, and edits and files opened in VS Code's editor. It is the same kvman you start with `kvman` in a terminal, with the same pages ([web-app.md](web-app.md)). VS Code 1.95 or newer is needed. You can drag the view to the secondary side bar, on the right.

## Installing

1. Install **kvman** from the Extensions view: search for `kvman` (publisher `ibndeif`). VS Code takes it from the Visual Studio Marketplace; Cursor, VSCodium, and Windsurf take it from Open VSX. Each release's `kvman.vsix` is also on its GitHub Release, for **Install from VSIX…**. Until the first release that carries the extension, build it from kvman's repository with `pnpm vscode:package`, and install `packages/vscode/dist/kvman.vsix` that way.
2. Open the kvman view: click the **KV** icon in the activity bar, or run **kvman: Open** from the Command Palette.

The extension runs the `kvman` program it finds on your PATH. If there is none, the view says **kvman isn't installed.** with an **Install kvman** button, which runs `npm i -g kvman --no-fund --loglevel=error` in a terminal and starts kvman when it has finished. That needs Node.js 24 ([installing.md](installing.md)); without npm, the view says so and links to nodejs.org. A kvman that is too old for the extension shows **Update kvman**.

## Using it

- **Your folder.** The view opens kvman in the window's first folder, as a workspace ([workspaces.md](workspaces.md)). A window with no folder opens Home. The workspace picker in the view still switches to any other workspace.
- **Starting.** kvman starts the first time you open the view, not when VS Code starts. If some extensions aren't part of kvman, VS Code asks first, listing each one, with **Run them**.
- **The title bar.** **Pages** lists kvman's pages (Chat, Models, Settings, Extensions, and those your extensions add). **Settings** opens kvman's settings in an editor tab. **Open in browser** opens the same workspace in your browser.
- **The chat.** The chat's header holds **History**, which lists your chats, and **New chat**.
- **Edits.** An edit the agent asks to make has **Open diff**, which shows the whole file with the change in VS Code's diff editor before you allow it; after it ran, **Open diff** shows the file's Git diff.
- **Files.** A file path in the chat opens the file in the editor, at the line the agent read or changed.
- **Add to kvman chat.** Right-click a selection in the editor, or a file in the explorer, and choose **Add to kvman chat**: the path and lines, and the selected code, go into the send box.
- **Links and sign-ins.** A link or a sign-in that opens a new window opens in your browser.
- **Another program.** The setting `kvman.path` names another `kvman` program to run.

## One kvman for every window

All VS Code windows share one running kvman, with the terminal and the desktop app: they use the same home folder, `~/.kvman`, with the same chats, keys, and workspaces ([desktop-app.md](desktop-app.md)).

The window that started kvman stops it when it closes. Another window that needs kvman then starts it again by itself. If kvman was already running, for example in a terminal, the extension uses it and leaves it running.

If kvman can't start, the view shows why, with **Try again** and **Show the log**, which opens `logs/kvman.log` from kvman's home. If kvman stops unexpectedly, the view says so, with **Start again**.

## Local folders only

kvman works on local folders only for now. In a remote window (SSH, WSL, Dev Containers, Codespaces), or a virtual folder, the view says so and starts nothing.

## Next

- [web-app.md](web-app.md)
- [workspaces.md](workspaces.md)
- [troubleshooting.md](troubleshooting.md)
