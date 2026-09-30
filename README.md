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
