# 01 — Overview

## 1.1 What kvman is

kvman is an app that works like a small operating system for every kind of user: developers, doctors, lawyers, and so on. A **kernel** runs **extensions**, and a **preset** decides which extensions run and how they are set up. That shapes the app a person uses. Every feature is an extension, including the web UI and the AI agent.

## 1.2 Running kvman

```
kvman [--mode web] [--preset coder] [--home <dir>] [--port <n>] [--yes] [--no-open] [--log-level <level>]
kvman --help | --version
```

- kvman is a **foreground app**. It starts the kernel and, in `web` mode, the HTTP server on `127.0.0.1:3737` (§4). It prints the URL, opens it in the browser, and stops on Ctrl+C (§2.14).
- **The start folder.** kvman opens the folder it's started from as a workspace (§2.6), unless that folder is the user's home folder, which is Home. The printed URL is `http://127.0.0.1:<port>/?workspace=<id>`, and kvwebui starts the tab in that workspace.
- **One kvman per home**, enforced by `kvman.lock`. When one is already running, a second `kvman` hands over: it reads the port from `kvman.lock`, calls the running kvman's `kernel.workspace.open` for its folder, prints and opens that workspace's URL, and exits 0. If a `--preset` or `--mode` it was given differs from the running kvman's (`kernel.health.get`; a preset is compared by its `name`), it fails `KVMAN_RUNNING` instead. A bare `kvman` hands over to whatever runs (ADR 0009, 44). A running kvman that is still starting, or doesn't answer, also fails `KVMAN_RUNNING` (ADR 0009, 43).
- **Modes:** `web` now; `tui` comes later.
- **Presets:** one is bundled: `coder` (the default), the coding harness, which also customizes kvman (§9). `--preset <name>` names a bundled preset or `<home>/presets/<name>.json` (a person's preset replaces a bundled one of the same name, ADR 0010, 4), and `--preset ./file.json` names a preset file: a value with `/` or `\`, or ending in `.json`, is a file, relative to the start folder. An unknown name or a missing file fails `VALIDATION_FAILED` (ADR 0009, 45).
- **Environment.** kvman sets `KVMAN_HOME` to its home in its own environment at start, so a program it runs (such as kvcustomizer's `kvman-docs`) finds this kvman through `<home>/kvman.lock` (ADR 0010, 19).
- **Trust:** before loading, kvman lists every non-bundled extension version that hasn't been accepted before and asks y/N in the terminal. `--yes` accepts them without asking; with no terminal and no `--yes`, kvman refuses to start (§2.9).
- **Browser.** kvman opens the URL with `xdg-open` (Linux), `open` (macOS), or `cmd /c start ""` (Windows). `--no-open` turns this off. A browser that can't be opened logs a warning, and kvman keeps running (ADR 0009, 50).
- **Logs.** `--log-level` is `debug`, `info` (the default), `warn`, or `error`. It filters `logs/kvman.log` and the terminal, which shows each record as one line (`HH:MM:SS LEVEL message`) on stderr; the URL and the trust prompt go to stdout. Terminal text is English (ADR 0009, 49).
- **Port.** `--port` overrides `kernel.port`; `--port 0` lets the OS pick a free port (ADR 0009, 46).
- **Exit codes.** A clean stop exits 0; a failed start exits 1; a second Ctrl+C or SIGTERM exits 130 at once (ADR 0009, 50).
- **Platforms:** Linux, macOS, and Windows, natively.
- There is no other `kvman` subcommand in this phase. Everything else goes through the web UI or the HTTP API (§4).
- **Installing.** `npm i -g kvman`. The `kvman` package holds the kernel, the bundled extensions, and the bundled presets.

## 1.3 The home folder

The default is `~/.kvman`; `--home <dir>` or `KVMAN_HOME` overrides it.

| Path | Holds |
|---|---|
| `kvman.lock` | The running kvman's pid and, once it listens, its port: `{ "pid", "port" }` (ADR 0009, 43). A second kvman hands over to it (§1.2); a lock whose process isn't alive is replaced. |
| `kvman.db` | The SQLite database (WAL): jobs, schedules, stores, settings, workspaces, files, accepted extensions. |
| `files/<id>` | File contents (§2.7). |
| `extensions/<name>@<version>/` | npm-installed extensions (§2.9). |
| `secrets.json` | Secrets: mode 0600 on Linux and macOS; on Windows, the user profile folder's access rules protect it (§2.8). |
| `presets/<name>.json` | The person's own presets (§1.2). |
| `logs/kvman.log` | Pino JSON logs, which never contain payloads, settings values, or secrets. |
| `logs/processes/<extension>/<workspaceId>/<name>.log` | Output of long-lived processes (§2.16), 10 MB each. |

## 1.4 Packages

A pnpm monorepo, Node 24, TypeScript 6.0 strict (ADR 0009). The tools are ESLint with typescript-eslint, Vitest, and Changesets. There is no CI in this phase: the gates run locally, on the developer's OS.

| Package | Is | May import |
|---|---|---|
| `packages/sdk` | The extension API: `ctx` types, zod, and the shared shapes (preset, extension manifest, Problem, job, envelope). Published as `@kvman/sdk`. | `zod` |
| `packages/kernel` | Everything the kernel does, including HTTP. Published as `@kvman/kernel`, at the root version. | `sdk`, its declared dependencies |
| `packages/cli` | The `kvman` bin; it runs the kernel in the same process. Published as `kvman`, with the bundled extensions and presets inside. | `kernel`, `sdk` |
| `packages/testkit` | `createTestKernel` for tests, and the bins that build and check extensions for any harness: `kvman-check`, `kvman-new`, `kvman-preset`, `kvman-preview` (§10). Published as `@kvman/testkit`. | `kernel`, `sdk` |
| `extensions/*` | kvai, kvwebui, kvcoder, kvcustomizer. Not published on their own. | `sdk`, their own npm dependencies; never `kernel`; another extension only when it is a `kvman.dependencies` entry: `import type`, or a runtime import of a subpath it exports (such a subpath may import only `sdk` and holds no state) |
| `presets/` | `coder.json`. | — |

Extensions list `@kvman/sdk` as a peerDependency, and every extension shares the kernel's own copy (§2.9). At runtime, extensions talk to each other only through `ctx.exec` and the other job calls (§3). Type-only imports exist for typed calls (§3.2). An extension may export subpaths that its dependents import (ADR 0001, 89). To let others register things with it, an extension exposes public commands and keeps what it receives in its own store (ADR 0001, 91).

## 1.5 Core extensions

Each is designed in its own round, after the kernel.

- **kvai**: LLM calls, providers, and models. The pi-ai package's providers and models come by default, and other extensions can add theirs. Agents, tools, and loops are built by the extensions that need them (§7).
- **kvwebui**: the Vue web app, plus a `kvwebui.*` API other extensions use to shape the UI.
- **kvcoder**: the app-building harness on kvai and kvwebui. Its agent has one tool, `run`, which runs a command of a connector (the built-in `shell`, `fs`, `artifact`, `background`, `ask`, `subagent`, and `mcp`, and those other extensions register); connectors and sections extend it (ADR 0011). Its conversation UI is its own (§8).
- **kvcustomizer**: the kvcoder extension for customizing kvman: it adds connectors and a prompt for developing extensions and presets, and for managing the running app (§9, ADR 0010).

## 1.6 Principles for this phase

- There are no events or listeners: only commands, queries, and schedules, each under its extension's namespace. An owner may offer a fixed set of points that others register handlers for: the kernel's job and lifecycle points (§2.15), and registries like kvcoder's connectors (§8.4).
- There are no sockets, no RPC, and no sandbox. The one push channel is a job's progress stream (§4.4).
- Build the simplest thing that can be maintained and built on.
