# kvman for VS Code

kvman in VS Code's secondary side bar, beside your files. kvman is an app that works like a small operating system: a kernel runs extensions, and a preset shapes them into the app you use, such as the coding harness.

## Using it

1. Install kvman: `npm i -g kvman --no-fund --loglevel=error`, or press **Install kvman** in the view, which runs it in a terminal. kvman needs Node.js 24.
2. Open the kvman view in the secondary side bar, or run **kvman: Open** from the Command Palette.

The view opens kvman in your window's first folder. A window with no folder opens Home. Each VS Code window joins the same running kvman, and it shares `~/.kvman` with a terminal `kvman` and the desktop app.

- **kvman: Open in browser** opens the same workspace in your browser.
- The setting `kvman.path` names another `kvman` program to run.
- kvman works on local folders only for now: in a remote window (SSH, WSL, Dev Containers, Codespaces) the view says so.

kvman runs only on your computer and listens only on `127.0.0.1`.
