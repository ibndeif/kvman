# kvman

An app that works like a small operating system for every kind of user: a kernel runs extensions, and a preset shapes them into the app a person uses.

The specification is `plan/` (start with `plan/README.md`). The previous implementation is on the branch `archive/v2`.

```
kvman [--mode web] [--preset coder] [--home <dir>] [--port <n>] [--yes] [--no-open] [--log-level <level>]
```

## Developing

Node 24 and pnpm (the version in `package.json` `packageManager`).

```
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check
```

| Script | Does |
|---|---|
| `pnpm typecheck` | TypeScript 6.0 strict on every package and the repository's own tooling |
| `pnpm lint` | ESLint: the import walls (`eslint/`), 300 lines per file, no `any`, and the other `CLAUDE.md` §5 rules |
| `pnpm test` | Vitest |
| `pnpm build` | Builds each package into its `dist/` |
| `pnpm bench:check` | Runs the benchmarks against their targets and `bench/baseline.json`; `pnpm bench:record` stores a new baseline |
| `pnpm changeset` | Adds a changeset (needed for every change to `@kvman/sdk`, `@kvman/testkit`, or an extension) |

## Status

| Milestone | What works |
|---|---|
| M1.1 Monorepo | The pnpm workspace with the empty packages `@kvman/sdk`, `@kvman/kernel`, `kvman` (the CLI), and `@kvman/testkit`; every gate; lint enforces the import walls and the 300-line limit. |
| M1.2 SDK | `@kvman/sdk`: the `Ctx` types (registrations, typed `exec` through the `Commands`, `Queries`, and `Settings` maps, store, files, settings, secrets, processes, `ctx.log`), `z`, and the zod schemas for manifests, presets, Problems, job and file rows, workspaces, and the HTTP envelope. |
| M1.3 Storage | The kernel's storage, not yet reachable from a running kvman: `kvman.db` (SQLite, WAL) with the kernel's tables; the store (kv and collections checked by their schema, `find` and `count`, transactions, workspace and global scopes, the 16 MiB cap); settings resolution with scopes; `secrets.json` with atomic writes; files with the 1 GiB cap; UUIDv7 ids. `pnpm bench:check` runs the collection `find` benchmark. |
| M1.4 Extensions and workers | The kernel loads `bundled` and `path:` extensions (a `path:` extension's TypeScript `kvman.source` runs directly) in dependency order, with every loading rule failing `EXTENSION_INVALID`; a `worker_threads` pool runs sync jobs with access, read-only, depth, size, validation, and timeout rules; every extension shares the kernel's `@kvman/sdk`; `ctx.log` writes to `logs/kvman.log`. `@kvman/testkit`'s `createTestKernel` runs it in tests. `pnpm bench:check` adds the `ctx.exec` benchmark. |
| M1.5 Async jobs and schedules | `ctx.execAsync` and `ctx.schedule` (`at`, cron, keys) write SQLite rows that start first-in, first-out, retry with 1, 2, 4 s backoff, survive restarts (unfinished attempts end `INTERRUPTED`), and are cleaned up after `kernel.jobs.retentionDays`; cancel; progress chunks; the kernel's handler points with loop safety; `kernel.started` and `kernel.stopping`; the Ctrl+C sequence. `pnpm bench:check` adds the `execAsync` throughput benchmark. |
| M1.6 Workspaces, kernel API, localization, hot reload | Workspaces (Home, remembered folders, closing as a pause, reopening by path) and the `kernel.workspace.opened` point; every `kernel.*` command and query (settings with scopes, secrets by name only and `set` sync only, jobs, files, extensions with JSON Schemas and revisions, processes, health), typed through `@kvman/sdk`; `ctx.settings.set`, `ctx.files`, and `ctx.processes` (process groups on Linux and macOS, `taskkill` on Windows, capped logs, `kernel.process.exited`, leftovers killed at start); locale catalogs merged per language with the `en` fallback, and the open `kernel.language`; hot reload of `path:` extensions (fresh workers while the old ones drain, the old code kept on failure, `kernel.started` rerun for dependents). |
| M1.7 HTTP | The kernel's HTTP API (`startHttp`, Hono on 127.0.0.1): Host and Origin checks (`FORBIDDEN_ORIGIN`); the envelope routes for commands (sync and async) and queries, with the `jobId`, route mismatches, raw-body caps, and cancel when a sync call's client leaves; jobs (get, cancel, and the SSE stream of progress, then the result or Problem); uploads and downloads (always attachments, naming their workspace); locales; `kvman.web` folders and `/` with the `index.html` fallback. The route tests arrive with the CLI in M1.8 (ADR 0009, 35); M1.7 unit-tests the pure parts. `pnpm bench:check` adds the HTTP round-trip benchmark. |
| M1.8 CLI | The `kvman` bin (`packages/cli`, run from source with `node --conditions=@kvman/source packages/cli/src/main.ts`, or `packages/cli/dist/main.js` after `pnpm build`): every flag, `--help`, and `--version`; `kvman.lock` (a stale lock is replaced; a second kvman hands its folder to the running one, or fails `KVMAN_RUNNING`); the start folder opened as a workspace and its `?workspace=<id>` URL printed and opened in the browser; presets by bundled name, `<home>/presets/<name>.json`, or file (no preset is bundled before M2.5, so pass `--preset <file>`); `npm:` extensions installed into `extensions/<name>@<version>/`; the trust prompt (`--yes`, refused without a terminal); `--port` (`0` picks a free one, `PORT_IN_USE`); Ctrl+C and SIGTERM stop in order, and a second one exits 130; Pino logs in `logs/kvman.log` and one line per record on the terminal, filtered by `--log-level`. The M1.7 HTTP routes and crash invariants 1, 2, 4, and 6 are tested against a real kvman child process (`packages/cli/test/`). |
| M2.1 kvai | `extensions/kvai` (`@kvman/kvai`, on `@earendil-works/pi-ai` 0.99.1): `kvai.complete` streams text, thinking, and tool-call deltas to the root job and returns pi-ai's assistant message (core fields only), the stop reason, and usage with cache reads and writes; it fails `kvai/KEY_MISSING`, `NO_MODEL`, `MODEL_UNKNOWN`, `RATE_LIMITED`, `CONTEXT_TOO_LONG`, or `PROVIDER_ERROR` (the key hidden in its reason), never retries, and takes 32 MiB contexts. All of pi-ai's built-in providers and models (keys only from the kvai secret `<provider>.apiKey`); custom providers over five wire APIs (a keyless one sends `none`) or a delegate command; `kvai.defaultModel`; usage totals per workspace and model (`kvai.usage.get`, `kvai.usage.total.get`); `kvai.ui.get` (the Models page and the usage status item); `en` and `ar` catalogs. The testkit gains `onProgress` and `@kvman/testkit/fake-openai`, the scripted OpenAI-compatible server kvai's tests use. Setting keys now take lower camelCase segments (ADR 0009, 64). |
| M2.2 kvwebui frame | `extensions/kvwebui` (`@kvman/kvwebui`), the Vue app the kernel serves at `/` (built into `extensions/kvwebui/dist/web` by `pnpm build`): the frame (the workspace picker with "Open a folder…" and close, where `?workspace=<id>` sets the tab's workspace once; language and theme menus; a collapsible nav; one panel at a time; the status bar with kvman's health; toasts and confirmations); pages, nav items, panels, and status items from every extension's `<namespace>.ui.get`, checked with zod (an invalid one shows an error card); every view component but `custom`, with forms from JSON Schema (password fields for `writeOnly` strings, marked fields on `VALIDATION_FAILED`), tables with search, "Show more", row links, and badges, and sanitized Markdown; the Settings page (titles, scopes, sources, secrets) and the Extensions page; `kvwebui.home` at `/` (`HOME_UNAVAILABLE` otherwise), right to left for `ar`, `he`, `fa`, and `ur`; IBM Plex fonts, light and dark. kvai's pages are redesigned without `tabs` (Models, a page per provider with its API key, Add a provider), and commands may be `syncOnly`. To try it, start kvman with a preset file such as `{ "name": "try", "extensions": { "@kvman/kvai": "bundled", "@kvman/kvwebui": "bundled" }, "settings": { "kvwebui.home": "kvai.models" } }` after `pnpm build`. |
