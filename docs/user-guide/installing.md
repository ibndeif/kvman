# Installing kvman

This page is for installing kvman on your computer and learning its command line. When you finish, you can start kvman, change how it starts with its flags, and know where it keeps its data.

## Requirements

- Node.js 24 (`node --version` should print `v24.…`)
- npm, which comes with Node.js
- Linux, macOS, or Windows (kvman runs natively on all three)

## Install

```sh
npm i -g kvman --no-fund --loglevel=error
```

npm shows its progress while it works, then one line such as `added 283 packages in 24s`.

The two flags only keep npm quiet. Without them the install works the same, and npm also prints three notices that you can ignore:

- `packages are looking for funding`: npm's own notice.
- `deprecated node-domexception`: a small package that Google's model client still uses.
- `install-scripts … not yet covered by allowScripts`: npm didn't run the install scripts of `@google/genai` and `protobufjs`. kvman doesn't need them, so don't allow them as npm suggests.

All three come from the Google model client inside the library that kvman's models use.

The `kvman` package holds the bundled presets, and npm installs the kernel and the bundled extensions with it, so everything you need arrives in one install.

Check it worked:

```sh
kvman --version
```

which prints the version, for example `0.1.0`, and:

```sh
kvman --help
```

which prints the usage text:

```text
Usage:
  kvman [--mode web] [--preset coder] [--home <dir>] [--port <n>] [--yes] [--no-open] [--log-level <level>]
  kvman uninstall [--home <dir>] [--yes] [--keep-data | --delete-data]
  kvman --help | --version

Options:
  --mode <mode>         How kvman runs: web (the default).
  --preset <preset>     A bundled preset, <home>/presets/<name>.json, or a preset file such as ./app.json. Default: coder.
  --home <dir>          kvman's home folder. Default: KVMAN_HOME, else ~/.kvman.
  --port <n>            The port to listen on (0 picks a free one). Default: the kernel.port setting (3737).
  --yes                 Accept new extension versions without asking.
  --no-open             Don't open the browser.
  --log-level <level>   debug, info (the default), warn, or error.
  --help                Show this help.
  --version             Show kvman's version.

Uninstall options:
  --home <dir>          The home folder whose data and running kvman are meant.
  --yes                 Remove kvman without asking; its data is kept unless --delete-data is given.
  --keep-data           Keep kvman's data without asking.
  --delete-data         Delete kvman's data without asking.
```

## Every flag

Each flag changes one thing about how kvman starts. You can combine them: `kvman --preset coder --port 4000 --no-open`.

| Flag | What it does | Example |
|---|---|---|
| `--mode <mode>` | How kvman runs. Only `web` exists now; `tui` comes later ("not in this phase"). | `kvman --mode web` |
| `--preset <preset>` | Which preset to run: a bundled one, your own by name, or a file. The default is `coder`. | `kvman --preset coder`, `kvman --preset ./app.json` |
| `--home <dir>` | Where kvman keeps its data. Overrides the `KVMAN_HOME` environment variable. | `kvman --home ~/.kvman-work` |
| `--port <n>` | Which port to listen on. `0` lets the OS pick a free one. Overrides the `kernel.port` setting (3737). | `kvman --port 4000` |
| `--yes` | Accept new extension versions without asking. | `kvman --yes` |
| `--no-open` | Don't open the browser. kvman still prints the URL. | `kvman --no-open` |
| `--log-level <level>` | How much to log: `debug`, `info` (the default), `warn`, or `error`. | `kvman --log-level debug` |
| `--help` | Show the help text and exit. | `kvman --help` |
| `--version` | Show kvman's version and exit. | `kvman --version` |

`kvman uninstall` is the only subcommand ([Removing kvman](#removing-kvman)). Everything else — settings, extensions, providers — happens in the web app or through its HTTP API.

## Removing kvman

```
kvman uninstall
```

It asks two questions, and only `y` agrees:

1. **Remove kvman?** This removes the program from this computer. If kvman is running, it says so and stops it first.
2. **Delete it too?** This is about your data: everything in the home folder (your chats, provider keys, presets, installed extensions, and logs). Answer `n`, or just press Enter, to keep it; a later install finds it again.

Nothing changes until both questions are answered, and nothing outside the home folder is ever deleted: your workspace folders and any preset file you keep elsewhere stay.

| Flag | What it does |
|---|---|
| `--home <dir>` | The home folder whose data, and whose running kvman, are meant. |
| `--yes` | Remove kvman without asking. Your data is kept unless you also give `--delete-data`. |
| `--keep-data` | Keep your data without asking. |
| `--delete-data` | Delete your data without asking. |

kvman removes itself with `npm uninstall -g kvman`, so this works for a kvman installed with `npm i -g kvman`. One installed another way says so and removes nothing: remove it the way you installed it. If npm fails, your data is left alone and kvman prints the line to run yourself.

## The home folder

kvman keeps everything in one folder: `~/.kvman` by default, or the folder you pass with `--home` (or set as `KVMAN_HOME`). When kvman starts, it sets `KVMAN_HOME` in its own environment, so programs it runs can find the same home.

| Path inside the home | What is in it |
|---|---|
| `kvman.lock` | The running kvman's pid and port. A second `kvman` reads it to hand over (see [workspaces.md](workspaces.md)). |
| `kvman.db` | The SQLite database: jobs, schedules, stored data, settings, workspaces, file records, accepted extensions. |
| `files/<id>` | The contents of uploaded and generated files. |
| `extensions/<name>@<version>/` | Extensions installed from npm. |
| `secrets.json` | Your secrets. Permissions are owner-only (`0600` on Linux and macOS; the user profile folder's rules on Windows). |
| `presets/<name>.json` | Your own presets. |
| `logs/kvman.log` | The logs, in JSON. They never contain payloads, settings values, or secrets. |
| `logs/processes/<extension>/<workspaceId>/<name>.log` | Output of long-running processes, 10 MB each. |

Back up the whole folder to move kvman to another machine.

## Stopping kvman

Press Ctrl+C once. kvman finishes running jobs where it can, stops the HTTP server, and exits with code 0. Press Ctrl+C (or SIGTERM) a second time and it stops at once, exiting 130.

## Updating

```sh
npm i -g kvman@latest --no-fund --loglevel=error
```

Your home folder is kept as-is; settings, secrets, and workspaces carry over. When a new extension version appears in your preset, kvman asks for your trust at the next start (`--yes` accepts without asking).

## Platform notes

- **Linux** — kvman opens the browser with `xdg-open`. Install that if your desktop lacks it, or use `--no-open`.
- **macOS** — kvman opens the browser with `open`.
- **Windows** — kvman opens the browser with `cmd /c start`. Use PowerShell 7 (`pwsh`) if you want the agent's shell to be PowerShell 7; otherwise it falls back to `powershell.exe`.

If kvman can't open a browser, it logs a warning and keeps running — copy the printed URL into a browser yourself.

## Next

- [first-run.md](first-run.md)
- [web-app.md](web-app.md)
