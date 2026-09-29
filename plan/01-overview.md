# 01 — Overview

## 1.1 What kvman is

kvman is an app that works like a small operating system for every kind of user: developers, doctors, lawyers, and so on. A **kernel** runs **extensions**, and a **preset** decides which extensions run and how they are set up. That shapes the app a person uses. Every feature is an extension, including the web UI and the AI agent.

## 1.2 Running kvman

```
kvman [--mode web] [--preset coder] [--home <dir>] [--port <n>] [--yes]
kvman --help | --version
```

- kvman is a **foreground app**. It starts the kernel and, in `web` mode, the HTTP server on `127.0.0.1:3737` (§4). It prints the URL and stops on Ctrl+C (§2.14).
- One kvman runs per home folder, enforced by `kvman.lock`.
- **Modes:** `web` now; `tui` comes later.
- **Presets:** two are bundled. `coder` (the coding harness) is the default; `dev` is for developing extensions and presets. `--preset <name>` names a bundled preset, and `--preset ./file.json` names a preset file.
- **Trust:** before loading, kvman lists every non-bundled extension version that hasn't been accepted before and asks y/N in the terminal. `--yes` accepts them without asking; with no terminal and no `--yes`, kvman refuses to start (§2.9).
- There is no other `kvman` subcommand in this phase. Everything else goes through the web UI or the HTTP API (§4).

## 1.3 The home folder

The default is `~/.kvman`; `--home <dir>` or `KVMAN_HOME` overrides it.

| Path | Holds |
|---|---|
| `kvman.lock` | The running kvman's pid and port; it keeps a second kvman out. |
| `kvman.db` | The SQLite database (WAL): jobs, schedules, stores, settings, workspaces, files, accepted extensions. |
| `files/<id>` | File contents (§2.7). |
| `extensions/<name>@<version>/` | npm-installed extensions (§2.9). |
| `secrets.json` | Secrets, mode 0600 (§2.8). |
| `logs/kvman.log` | Pino JSON logs, which never contain payloads, settings values, or secrets. |
| `logs/processes/<extension>/<name>.log` | Output of long-lived processes (§2.16), 10 MB each. |

## 1.4 Packages

A pnpm monorepo, Node 24, TypeScript strict.

| Package | Is | May import |
|---|---|---|
| `packages/sdk` | The extension API: `ctx` types, zod, and the shared shapes (preset, extension manifest, Problem, job, envelope). | `zod` |
| `packages/kernel` | Everything the kernel does, including HTTP. | `sdk`, its declared dependencies |
| `packages/cli` | The `kvman` bin; it runs the kernel in the same process. | `kernel`, `sdk` |
| `packages/testkit` | `createTestKernel` for tests (§10). | `kernel`, `sdk` |
| `extensions/*` | kvai, kvwebui, kvcoder, kvdev. | `sdk`, their own npm dependencies; never `kernel`; another extension only when it is a `kvman.dependencies` entry: `import type`, or a runtime import of a subpath it exports (such a subpath may import only `sdk` and holds no state) |
| `presets/` | `coder.json`, `dev.json`. | — |

At runtime, extensions talk to each other only through `ctx.exec` and the other job calls (§3). Type-only imports exist for typed calls (§3.2). An extension may export subpaths that its dependents import (ADR 0001, 89). To let others register things with it, an extension exposes public commands and keeps what it receives in its own store (ADR 0001, 91).

## 1.5 Core extensions

Each is designed in its own round, after the kernel.

- **kvai**: LLM calls, providers, and models. The pi-ai package's providers and models come by default, and other extensions can add theirs. Agents, tools, and loops are built by the extensions that need them (§7).
- **kvwebui**: the Vue web app, plus a `kvwebui.*` API other extensions use to shape the UI.
- **kvcoder**: the app-building harness on kvai and kvwebui. Its agent has only a bash tool; connectors (including the built-in `ask` and `subagent`) and sections extend it (§8).
- **kvdev**: the harness for developing kvman extensions and presets.

## 1.6 Principles for this phase

- There are no events or listeners: only commands, queries, and schedules, each under its extension's namespace. An owner may offer a fixed set of points that others register handlers for: the kernel's job and lifecycle points (§2.15), and registries like kvcoder's connectors (§8.4).
- There are no sockets, no RPC, and no sandbox. The one push channel is a job's progress stream (§4.4).
- Build the simplest thing that can be maintained and built on.
