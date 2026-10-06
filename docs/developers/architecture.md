# Architecture

This page is for contributors and for anyone who wants to know how kvman is built. When you finish, you can say what the kernel does and doesn't know, how a job travels from a call to a worker and back, what the packages are, and why the import walls exist.

## The idea

kvman works like a small operating system. A **kernel** runs **extensions**; a **preset** chooses which extensions run and with what settings. Every feature is an extension: the web UI (kvwebui), the model access (kvai), the coding app (kvcoder), and the customizing tools (kvbuilder). The kernel knows no product concept: no chat, no agent, no UI.

## Running

`kvman` is a **foreground app** that runs locally, one per home folder (`~/.kvman`). It opens the folder it starts in as a workspace, and a second run hands its folder over to the running one (`kvman.lock`). The HTTP server listens on `127.0.0.1:3737` only. Linux, macOS, and Windows are supported natively: code that depends on the OS has an explicit branch per OS, and its tests cover each branch.

## Jobs

Everything runs as a **job**: a **command** (may write) or a **query** (read-only).

- `ctx.exec` runs a job now and returns its output.
- `ctx.execAsync` and `ctx.schedule` make SQLite rows that survive restarts and retry.
- There are **no events or listeners**. Owners offer fixed points that others register handlers for: the kernel's job and lifecycle points (`ctx.registerHandler`), and extension registries such as kvcoder's connectors. An owner that only reads from others pulls from public queries instead.

## Workers

A pool of `worker_threads` runs every job; **the kernel's main thread never runs extension code**. Every worker loads every extension, and any job runs on any free worker. `AsyncLocalStorage` gives each handler its current job (workspace, caller, signal). The main thread owns what only it may do: the database's lifecycle, the lock, the preset files, secrets writes, and process management; workers ask it with requests.

## Storage

One SQLite database (better-sqlite3, WAL), with a connection per worker. Extensions get Promise-based `ctx.store` (kv and JSON collections) per workspace and home-wide; each call commits alone, and `transaction(tx => …)` is synchronous. Secrets live only in `secrets.json`.

## How a call runs

1. A caller (HTTP, a test, or an extension's `ctx.exec`) names a job and gives an input.
2. The kernel resolves the registration, checks access (`NOT_PUBLIC`) and the caller's rights, validates the input with the registration's zod schema, and picks a worker.
3. The worker runs the handler inside `AsyncLocalStorage` with the job's context; the kernel validates the output.
4. A sync job answers the caller; an async job is a row that moves `queued` → `running` → `succeeded`, `failed`, or `cancelled`, with retries and backoff, and its progress chunks stream to `GET /api/jobs/:id/stream`.
5. The end of a job, in the same transaction, queues one async job per registered `kernel.job.*` handler.

## Extensions

An extension's `package.json` `kvman` field declares its namespace and dependencies; its entry registers commands, queries, settings, and handlers with zod schemas and descriptions. `@kvman/sdk` is a peer dependency: every extension shares the kernel's copy and its `z`. Registrations are private unless `public: true`. There is no sandbox in this phase, so a non-bundled version needs the person's trust at start.

## The packages

A pnpm monorepo, Node 24, TypeScript 6.0 strict.

| Package | Is | May import |
|---|---|---|
| `packages/sdk` | The extension API: `ctx` types, zod, and the shared shapes. Published as `@kvman/sdk`. | `zod` |
| `packages/kernel` | Everything the kernel does, including HTTP. Published as `@kvman/kernel`. | `sdk`, its declared dependencies |
| `packages/cli` | The `kvman` bin; it runs the kernel in the same process. Published as `kvman`, with the bundled presets inside (`packages/cli/presets/`); the bundled extensions are its dependencies. | `kernel`, `sdk` |
| `packages/testkit` | `createTestKernel` and the bins `kvman-check`, `kvman-new`, `kvman-preset`, `kvman-preview`, `kvman-docs`. Published as `@kvman/testkit`. | `kernel`, `sdk` |
| `extensions/*` | kvai, kvwebui, kvcoder, kvbuilder. Each is published under its own name, such as `@kvman/kvai`. | `sdk`, their own npm dependencies; never `kernel`; another extension only when it is a `kvman.dependencies` entry: `import type`, or a runtime import of a subpath it exports (which may import only `sdk` and holds no state) |

The **import walls** are enforced by ESLint and are never bypassed. They make the kernel replaceable and extensions independent: an extension can't reach into the kernel, so everything it does goes through the SDK and the job calls, which is what makes a preset's extension set free to change. kvbuilder finds the testkit's bins as files of its own dependency and runs them as child processes, so it never imports the testkit either.

## Where the code lives

| Look in | For |
|---|---|
| `packages/kernel/src/jobs`, `workers`, `schedules` | job registry, dispatcher, retries, the worker pool and its protocol |
| `packages/kernel/src/store`, `storage`, `files`, `secrets`, `settings` | the store, SQLite, files, `secrets.json`, settings |
| `packages/kernel/src/extensions`, `reload` | manifests, load order, trust, npm install, hot reload |
| `packages/kernel/src/kernel-api`, `preset-edit` | the `kernel.*` commands and queries, and the preset file edits |
| `packages/kernel/src/http` | routes, the envelope, security, the job stream |
| `packages/cli/src` | argument parsing, preset lookup, the lock, hand-over |
| `packages/testkit/src` | the test kernel, the fake clock and OpenAI server, and each bin |
| `extensions/<name>/src`, `locales`, `docs`, `web` | an extension's code, texts, pages, and Vue app |
| `plan/` | the specification: names, shapes, error codes, and limits are exact there |

## Next

- [contributing.md](contributing.md)
- [jobs.md](jobs.md)
- [kernel-api.md](kernel-api.md)
