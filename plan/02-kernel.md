# 02 — Kernel

The kernel wires everything together. It runs jobs and schedules, and it owns storage, files, settings, secrets, workspaces, extension loading, localization, and the HTTP API (§4). It knows no product concept: sessions, agents, pages, and tools all live in extensions.

## 2.1 Jobs

Everything an extension does runs as a **job**. A job runs a registered **command** or **query**.

| | Command | Query |
|---|---|---|
| Does | may write | only reads |
| `ctx.exec` (sync: runs now, returns the output) | yes | yes |
| `ctx.execAsync` (queued, returns a job id) | yes | no: `NOT_A_COMMAND` |
| `ctx.schedule` (runs at a time or on a cron) | yes | no: `NOT_A_COMMAND` |
| Writes (`store`, `files`, `settings`, `secrets`), `execAsync`, `schedule` | allowed | fail with `READ_ONLY` |
| `ctx.exec` inside it | commands and queries | queries only (`READ_ONLY` otherwise) |

- A name is registered once, as a command or a query, never both.
- **Sync jobs** (`ctx.exec`, and HTTP calls without `async`) run at once on a worker and leave no row.
- **Async and scheduled jobs** are rows in SQLite.
  - A row has the id, command, input, workspace, caller, status, attempts, result or Problem, and times.
  - The status is one of `queued`, `running`, `succeeded`, `failed`, or `cancelled`.
  - An unfinished row runs again after a restart.
- Rows of finished jobs are deleted after `kernel.jobs.retentionDays` (default 7), at start and then hourly. Queued and running rows are never deleted.
- **Validation.** The kernel checks a job's input against the registration's zod `input` before it runs, and its output against `output` after. A mismatch fails with `VALIDATION_FAILED`.
- **Ordering.** Queued jobs start first-in, first-out and run in parallel. The kernel keeps no other ordering; an extension that needs one-at-a-time (such as one agent turn per session) guards it in its own store.
- **Depth.** A chain of sync `ctx.exec` calls deeper than 16 fails with `TOO_DEEP`. An async job starts a new chain.
- **Caller.** A job's caller is `{ kind: 'user' }` for an HTTP call, or `{ kind: 'extension', name }` for a call from an extension's handler. A scheduled job's caller is the extension that scheduled it.

## 2.2 Workers

- The kernel starts a pool of `worker_threads`. The size is the `kernel.workers` setting: default CPU cores − 1, minimum 1.
- Every worker loads every extension of the run. Any job runs on any free worker.
- A worker runs up to `kernel.workerConcurrency` jobs at once (default 32), since handlers mostly wait on I/O. A job that hogs the CPU slows only its own worker.
- **The current job.** A worker tracks each running job with `AsyncLocalStorage`. Inside a handler, `ctx.store`, `ctx.files`, `ctx.settings`, `ctx.secrets`, and the job calls use that job's workspace and caller, and `ctx.job` describes it (§3.3). Calling any of these outside a job fails with `NO_JOB`.
- Handlers keep no in-memory state between jobs. Anything that must last goes in the store.
- **Crashes.** When a worker dies, each job it was running fails that attempt with `WORKER_CRASHED`, and the kernel starts a replacement worker.

## 2.3 Failures, retries, timeouts, cancel

- A command may set `retries` (default 3) and `timeoutMs` (default 600 000, ten minutes). A query may set `timeoutMs`.
- **Timeouts.** An attempt that runs past `timeoutMs` fails with `TIMEOUT`, and its signal is aborted.
- **Async and scheduled jobs.** A thrown error, a timeout, or a worker crash is retried after an exponential backoff (1 s, 2 s, 4 s, …) until the retries run out. Then the job ends `failed` with the last Problem. A Problem made with `ctx.problem(code)` ends the job `failed` at once, without a retry.
- **Sync jobs** are never retried; the caller gets the Problem.
- Because an async job can run more than once, handlers are written to be safe to repeat.
- **Unknown errors.** A thrown error that isn't a Problem becomes `HANDLER_FAILED`. Its message and stack go to the log, never to the caller.
- **Cancel.** `ctx.cancel(jobId)` or `POST /api/jobs/:id/cancel` aborts the job's `ctx.job.signal` and ends it `cancelled`, with no retry. Jobs it started with `ctx.exec` share its signal; jobs it started with `execAsync` don't.

## 2.4 Schedules

- `ctx.schedule(command, input, { at })` runs a command once at a date; `{ cron }` repeats it. croner computes the next run time.
- A schedule is a row with its id, command, input, `at` or `cron`, next run, workspace, and owner. It belongs to the workspace of the job that made it. `ctx.schedule.cancel(id)` deletes it.
- When a schedule is due, the kernel queues an async job in the schedule's workspace, with the owner as its caller. A one-time schedule is then deleted.
- A run that fell due while kvman was stopped runs once at the next start; missed repeats are not replayed.

## 2.5 Storage

- There is one SQLite database, `kvman.db`, in WAL mode with a busy timeout. The main thread and every worker each open their own better-sqlite3 connection.
- The kernel owns every table. Extensions never see SQL and have no migrations.
- **Store API** (§3.4). Every call returns a Promise.
  - `ctx.store.kv` has `get`, `set`, and `delete`.
  - `ctx.store.collection(name)` holds JSON documents with kernel-assigned ids, with `insert`, `get`, `find` (equality filters on top-level fields, plus a required `limit`), `update`, and `delete`.
- **Scope.** `ctx.store` is the current job's workspace; `ctx.store.global` is home-wide. Both hold only the calling extension's data.
- **Atomicity.** Each call commits on its own. `ctx.store.transaction(fn)` runs `fn(tx)` in one SQLite transaction. `tx` has the store's shape, but its calls are synchronous, so the lock is never held across an `await`. If `fn` returns a Promise, the transaction is rolled back and fails with `VALIDATION_FAILED`.

## 2.6 Workspaces

- A workspace is a folder on disk, `{ id, name, path }`. The user's home folder is the built-in **Home** workspace, which is always open.
- Other folders are opened with `kernel.workspace.open`, and they can be listed and closed (§2.12).
- Every job has a workspace. An HTTP call names it with `workspaceId`, defaulting to Home, and nested jobs inherit it.
- `ctx.job.workspace.path` is the folder. Extensions use `node:fs` and `node:child_process` on it directly; the kernel adds no file or process service for workspace folders. Child processes stop with kvman, and a handler kills its own on cancel.

## 2.7 Files

- Files are content the kernel keeps for extensions and uploads: `files/<id>` in the home, plus a row with the id, name, media type, size, owner (`{ kind: 'user' }` or an extension), workspace, and creation time.
- Extensions use `ctx.files.write(name, data, type)`, `get(id)` (the row), `read(id)` (a Buffer), `path(id)` (the absolute path, for streaming), and `unlink(id)`. The user uploads with `POST /api/files` (§4.1).
- **Access.**
  - Any extension can read any file of the job's workspace by id.
  - Only the owner can unlink a file. A user upload can be unlinked by the user or by any extension.
- There is no deduplication and no garbage collection.

## 2.8 Settings and secrets

**Settings.**
- An extension declares each key: `ctx.registerSetting('kvai.defaultModel', { description, schema, default })`. A key starts with the extension's namespace.
- **Resolving a value.** A value comes from the workspace, else the global value, else the preset, else the default.
- Values are stored in SQLite and checked against the key's schema when set.
- **Access.**
  - Any extension reads any key with `ctx.settings.get(key)`.
  - An extension writes only its own keys, with `ctx.settings.set(key, value, { scope: 'global' | 'workspace' })`.
  - The user changes any key with `kernel.settings.set`.
- The kernel's own keys are `kernel.port` (3737), `kernel.workers`, `kernel.workerConcurrency` (32), `kernel.language` (`en`), `kernel.jobs.retentionDays` (7), and `kernel.web.home` (`kvwebui`, §4.1).

**Secrets.**
- `ctx.secrets.get/set/delete(name)` belong to the calling extension and are home-wide. They're stored in `secrets.json` (mode 0600).
- A secret is never written to SQLite, settings, job rows, logs, or any HTTP response. The user sets and deletes secrets with `kernel.secrets.*`, which never returns a value.

## 2.9 Extensions

**Package.** An extension is a package whose `package.json` has `main` and a `kvman` field:

```json
{ "name": "@kvman/kvcoder", "version": "1.0.0", "main": "dist/index.js",
  "kvman": { "namespace": "kvcoder", "dependencies": { "@kvman/kvai": "^1.0.0", "@kvman/kvwebui": "^1.0.0" } } }
```

**Web files.** An extension may add `"web": "<folder>"` to its `kvman` field, and the kernel serves that folder at `/web/<namespace>/` (§4.1). This is how kvwebui ships its app and how extensions ship Vue components.

**Entry.** `main` default-exports `(ctx) => void`, which registers the extension's commands, queries, and settings (§3.1). It runs in every worker when the worker loads.

**Sources** (named in the preset, §2.10):
- `bundled`: a core extension shipped with kvman.
- `npm:<exact version>`: the kernel runs `npm install --ignore-scripts --omit=dev <name>@<version>` into `extensions/<name>@<version>/`. npm must be on the PATH.
- `path:<folder>`: a local folder, relative to the preset file.

**Trust.**
- A non-bundled version is loaded only after it's accepted. At start, kvman lists the name, version, and source of each version not yet accepted, and asks y/N in the terminal.
- `--yes` accepts them. Accepted versions are remembered in SQLite, and a new version asks again.
- With no terminal and no `--yes`, kvman refuses to start.

**Loading.** Extensions load in dependency order. kvman stops with `EXTENSION_INVALID` (§2.14) when:
- a dependency is missing or out of range;
- two extensions claim one namespace;
- a registered name doesn't start with `<namespace>.`;
- a name is registered twice;
- a registration is invalid (for example, no description);
- an entry throws.

**Hot reload.**
- A `path:` extension's folder is watched. On a change, every worker reloads it and its registrations are replaced. Running jobs finish on the old code.
- A reload that fails keeps the previous code and logs the error.

**Access.**
- A registration is private by default: only its own extension can call it.
- With `public: true`, other extensions and HTTP clients can call it too. Calling a private name from outside fails with `NOT_PUBLIC`.

## 2.10 Presets

```json
{ "name": "coder",
  "extensions": { "@kvman/kvai": "bundled", "@acme/x": "npm:1.2.3", "@me/y": "path:../y" },
  "settings": { "kvai.defaultModel": "…", "kvwebui.home": "kvcoder.chat" } }
```

- A preset is the whole app for one run: which extensions load, and the preset-level value of any setting.
- The app's UI shape is kvwebui's own settings; the kernel knows no UI concept.
- A preset is validated at start. An invalid preset stops kvman with `VALIDATION_FAILED`.
- Bundled presets: `coder` (the default) and `dev`.

## 2.11 Localization

- The kernel and each extension ship `locales/en.json` and `locales/ar.json`, with keys under their namespace. Error texts are `<namespace>.errors.<CODE>`.
- The kernel merges the catalogs and serves them at `GET /api/locales/:lang`.
- The language is `kernel.language` (default `en`). Arabic is right-to-left, and the UI follows the setting.

## 2.12 The kernel's own commands and queries

All are public. Types are in `@kvman/sdk`.

| Name | Kind | Input → output |
|---|---|---|
| `kernel.workspace.open` | command | `{ path }` → `Workspace` (the existing one, if that path is already open) |
| `kernel.workspace.close` | command | `{ workspaceId }` → `{}` (Home can't be closed: `VALIDATION_FAILED`) |
| `kernel.workspace.list` | query | `{}` → `Workspace[]` |
| `kernel.settings.set` | command | `{ key, value, scope: 'global' \| 'workspace' }` → `{}` |
| `kernel.settings.reset` | command | `{ key, scope }` → `{}` |
| `kernel.settings.list` | query | `{}` → `[{ key, description, schema, value, source }]`, where `schema` is JSON Schema and `source` is `workspace`, `global`, `preset`, or `default` |
| `kernel.secrets.set` | command | `{ extension, name, value }` → `{}` |
| `kernel.secrets.delete` | command | `{ extension, name }` → `{}` |
| `kernel.secrets.list` | query | `{}` → `[{ extension, name }]` (never values) |
| `kernel.jobs.get` | query | `{ id }` → `Job` |
| `kernel.jobs.list` | query | `{ status?, limit }` → `Job[]` in this workspace, newest first |
| `kernel.files.get` | query | `{ id }` → `File` |
| `kernel.files.list` | query | `{ limit }` → `File[]` in this workspace, newest first |
| `kernel.files.unlink` | command | `{ id }` → `{}` |
| `kernel.extensions.list` | query | `{}` → `[{ name, version, source, namespace, commands, queries, settings }]`; each command and query is `{ name, description, public, input, output }`, with `input` and `output` as JSON Schema |
| `kernel.health.get` | query | `{}` → `{ version, preset, mode, workers, uptimeMs }` |

There is no sandbox in this phase, so extensions can call these too.

## 2.13 Limits

Going over a limit fails loudly and never cuts anything off.

| Limit | Value | Error |
|---|---|---|
| Job input or output | 1 MiB of JSON by default; a registration may set `maxInputBytes` and `maxOutputBytes` up to 32 MiB | `TOO_LARGE` |
| Progress chunk | 64 KiB | `TOO_LARGE` |
| File | 1 GiB | `TOO_LARGE` |
| `find` and `list` limits | required, at most 1000 | `VALIDATION_FAILED` |
| Sync `ctx.exec` depth | 16 | `TOO_DEEP` |

## 2.14 Start and stop

**Start.** Each step must succeed; any failure prints the Problem and a hint, then exits with code 1.
1. Take `kvman.lock` (`KVMAN_RUNNING` if another kvman holds it).
2. Open the database.
3. Read and validate the preset.
4. Install missing npm extensions.
5. Ask for trust.
6. Start the workers, which load the extensions (`EXTENSION_INVALID`). In `web` mode, an extension whose namespace is `kernel.web.home` must declare `kvman.web` (`EXTENSION_INVALID` otherwise).
7. Delete expired job rows, then resume unfinished jobs and due schedules.
8. Listen on the port (`PORT_IN_USE`), then print the URL.

**Stop (Ctrl+C).**
1. HTTP stops taking requests.
2. Every running job's signal is aborted with the reason `shutdown`.
3. kvman waits up to 10 s for handlers to return, then stops the workers.
4. Async jobs that didn't finish stay `queued` and run again at the next start.

A second Ctrl+C stops at once.
