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
  - A row is a `Job`: `{ id, name, input, workspaceId, caller, status, attempts, retries, output?, problem?, createdAt, startedAt?, endedAt? }`. Times in kernel rows are ISO 8601 strings (ADR 0009, 5).
  - The status is one of `queued`, `running`, `succeeded`, `failed`, or `cancelled`.
  - An attempt cut off by a stop or by kvman dying fails with `INTERRUPTED` and is retried like any failure (§2.3), so an unfinished row runs again after a restart if it has retries left.
- Rows of finished jobs are deleted after `kernel.jobs.retentionDays` (default 7), at start and then hourly. Queued and running rows are never deleted.
- **Validation.** The kernel checks a job's input against the registration's zod `input` before it runs, and its output against `output` after. A mismatch fails with `VALIDATION_FAILED`.
- **Ordering.** Queued jobs start first-in, first-out and run in parallel. A job a handler queues with `execAsync` starts only after the handler has its id (ADR 0009, 112). The kernel keeps no other ordering; an extension that needs one-at-a-time (such as one agent turn per session) guards it in its own store.
- **Depth.** A chain of sync `ctx.exec` calls deeper than 16 fails with `TOO_DEEP`. An async job starts a new chain.
- **Where nested jobs run.** A nested sync `ctx.exec` runs on the calling job's worker and takes no extra slot, so a busy pool can't deadlock.
- **Caller.** A job's caller is `{ kind: 'user' }` for an HTTP call, `{ kind: 'extension', name }` for a call from an extension's handler, or `{ kind: 'kernel' }` for a handler job (§2.15). A scheduled job's caller is the extension that scheduled it.

## 2.2 Workers

- The kernel starts a pool of `worker_threads`. The size is the `kernel.workers` setting: default CPU cores − 1, minimum 1.
- Every worker loads every extension of the run. Any job runs on any free worker.
- A worker's `process.argv` is the main thread's, copied in when it starts, so `process.argv[1]` is kvman's entry file in every handler (ADR 0009, 114).
- A worker runs up to `kernel.workerConcurrency` jobs at once (default 32), since handlers mostly wait on I/O. A job that hogs the CPU slows only its own worker.
- **The current job.** A worker tracks each running job with `AsyncLocalStorage`. Inside a handler, `ctx.store`, `ctx.files`, `ctx.settings`, `ctx.secrets`, and the job calls use that job's workspace and caller, and `ctx.job` describes it (§3.3). Calling any of these outside a job fails with `NO_JOB`.
- Handlers keep no in-memory state between jobs. Anything that must last goes in the store.
- **Work ends with its job.** A handler's in-process work ends when it returns. Long or repeated work goes to `execAsync` or `ctx.schedule`, never `setTimeout`, `setInterval`, or an unawaited promise. This is a rule, not policed by the kernel.
- **Crashes.** When a worker dies, each job it was running fails that attempt with `WORKER_CRASHED`, and the kernel starts a replacement worker.
- **Logging.** `ctx.log` writes to `logs/kvman.log`, tagged with the extension and the job id (§3.5).

## 2.3 Failures, retries, timeouts, cancel

- A command may set `retries` (default 3) and `timeoutMs` (default 600 000, ten minutes). A query may set `timeoutMs`.
- **Timeouts.** An attempt that runs past `timeoutMs` fails with `TIMEOUT`, and its signal is aborted.
- **Async and scheduled jobs.** A thrown error (`HANDLER_FAILED`), a timeout, a worker crash, or an interruption (`INTERRUPTED`: kvman stopped or died during the attempt) is retried after an exponential backoff (1 s, 2 s, 4 s, …) until the retries run out. Then the job ends `failed` with the last Problem. Every other Problem, including one made with `ctx.problem(code)` and a kernel Problem such as `VALIDATION_FAILED`, ends the job `failed` at once, without a retry (ADR 0009, 14).
- **Sync jobs** are never retried; the caller gets the Problem.
- Because an async job can run more than once, handlers are written to be safe to repeat.
- **Unknown errors.** A thrown error that isn't a Problem becomes `HANDLER_FAILED`. Its message and stack go to the log, never to the caller.
- **Cancel.** `ctx.cancel(jobId)` or `POST /api/jobs/:id/cancel` aborts the job's `ctx.job.signal`. A queued job ends `cancelled` at once; cancelling a finished job does nothing; an unknown id fails `NOT_FOUND` (ADR 0009, 17). The job ends `cancelled`, with no retry, when its handler settles after the abort, or at its timeout if it ignores the signal. Jobs it started with `ctx.exec` share its signal; jobs it started with `execAsync` don't. A sync HTTP call whose client disconnects is cancelled the same way.

## 2.4 Schedules

- `ctx.schedule(command, input, { at })` runs a command once at a date; `{ cron }` repeats it. croner computes the next run time.
- **Keys.** `{ at | cron, key }` names the schedule. A key is unique per extension and workspace: scheduling again with the same key replaces the schedule and keeps its id. Recurring maintenance scheduled from `kernel.started` uses a key, so restarts don't pile up copies.
- A schedule is a row with its id, command, input, `at` or `cron`, next run, workspace, and owner. It belongs to the workspace of the job that made it. `ctx.schedule.cancel(id)` deletes it.
- When a schedule is due, the kernel queues an async job in the schedule's workspace, with the owner as its caller. A one-time schedule is then deleted.
- A run that fell due while kvman was stopped, or while its workspace was closed (§2.6), runs once at the next start or reopening; missed repeats are not replayed.

## 2.5 Storage

- There is one SQLite database, `kvman.db`, in WAL mode (`synchronous = NORMAL`, ADR 0009, 21) with a busy timeout. The main thread and every worker each open their own better-sqlite3 connection.
- The kernel owns every table. Extensions never see SQL and have no migrations.
- **Store API** (§3.4). Every call returns a Promise.
  - `ctx.store.kv` has `get`, `set`, and `delete`.
  - `ctx.store.collection(name, schema)` holds JSON documents with kernel-assigned ids (UUIDv7), with `insert`, `get`, `find`, `count`, `update`, and `delete`. `schema` is the zod schema of a document without its `id`: writes are checked against it, and reads parse through it, so a stored document that no longer fits fails `VALIDATION_FAILED` (ADR 0009, 4).
  - `kv.get(key)` and `collection.get(id)` return `undefined` when nothing is stored there.
  - `find(filter, { limit, order? })` takes equality filters on top-level fields (`string`, `number`, `boolean`, or `null` values) and a required `limit`, and returns documents by id: `order` is `'asc'` (the default, oldest first) or `'desc'`. `count(filter)` returns the number of matches.
  - `update` and `delete` of a missing id fail `NOT_FOUND`.
  - A document or a kv value is JSON of at most 16 MiB (`TOO_LARGE`).
- **Scope.** `ctx.store` is the current job's workspace; `ctx.store.global` is home-wide. Both hold only the calling extension's data.
- **Atomicity.** Each call commits on its own. `ctx.store.transaction(fn)` runs `fn(tx)` in one SQLite transaction. `tx` has the store's shape (including `tx.global`), but its calls are synchronous, so the lock is never held across an `await`. If `fn` returns a Promise, the transaction is rolled back and fails with `VALIDATION_FAILED`. A transaction takes the write lock when it starts (ADR 0009, 111).

## 2.6 Workspaces

- A workspace is a folder on disk, `{ id, name, path }`. The user's home folder is the built-in **Home** workspace, with the id `home`, which is always open.
- Other folders are opened with `kernel.workspace.open`, and they can be listed and closed (§2.12). At start, kvman opens the folder it's started from (§1.2).
- `kernel.workspace.open` needs an absolute path to an existing folder (`VALIDATION_FAILED` otherwise). The path is resolved with `realpath`, so a symlink or a trailing slash reopens the same workspace, and Home's own folder answers Home. A workspace's id is a UUIDv7, and its name is its folder's basename (ADR 0009, 22).
- **Remembered.** Workspaces are kept across restarts until closed. Opening a path that was open before gets the same id, and so the same data.
- **Closing pauses.** Closing a workspace removes it from the list. Its data stays; its queued jobs and schedules wait until it's opened again; its running jobs finish; and calls naming it fail `NOT_FOUND`.
- Every job has a workspace. An HTTP call names it with `workspaceId`, defaulting to Home, and nested jobs inherit it.
- `ctx.job.workspace.path` is the folder. Extensions use `node:fs` and `node:child_process` on it directly for work inside a job. A handler kills its own short-lived processes on cancel: the process group on Linux and macOS, `taskkill /PID <pid> /T /F` on Windows. Long-lived processes use the kernel's process service (§2.16).

## 2.7 Files

- Files are content the kernel keeps for extensions and uploads: `files/<id>` in the home, plus a `File` row `{ id, name, type, size, owner, workspaceId, createdAt }`, where `type` is the media type and `owner` is `{ kind: 'user' }` or `{ kind: 'extension', name }`.
- Extensions use `ctx.files.write(name, data, type)`, `get(id)` (the row), `read(id)` (a Buffer), `path(id)` (the absolute path, for streaming), and `unlink(id)`. The user uploads with `POST /api/files` (§4.1).
- **Access.**
  - Any extension can read any file of the job's workspace by id. A file of another workspace is `NOT_FOUND` (ADR 0009, 24).
  - Only the owner can unlink a file. A user upload can be unlinked by the user or by any extension. Unlinking a file the caller doesn't own fails `NOT_PUBLIC`.
- There is no deduplication and no garbage collection.

## 2.8 Settings and secrets

**Settings.**
- An extension declares each key: `ctx.registerSetting('kvai.defaultModel', { description, schema, default?, scopes? })`. A key starts with the extension's namespace, and its segments are lower camelCase (ADR 0009, 64).
- **Scopes.** `scopes` is `['global', 'workspace']` (the default), `['global']`, or `[]`. Setting a key in a scope it doesn't have fails `VALIDATION_FAILED`. A key with `scopes: []` is **preset-only**: only the preset gives it a value, and the Settings page shows it read-only.
- **Required keys.** A key registered without `default` must get its value from the preset; otherwise kvman stops at start with `VALIDATION_FAILED` (§2.14, step 7).
- **Resolving a value.** A value comes from the workspace, else the global value, else the preset, else the default.
- Values are stored in SQLite and checked against the key's schema when set. A stored value that no longer fits its schema (after an upgrade) is skipped, with a logged warning, and the next source is used.
- Preset values are checked once the extensions have loaded (§2.14): an unknown key, an invalid value, or a required key without a value stops kvman with `VALIDATION_FAILED`.
- **Access.**
  - Any extension reads any key with `ctx.settings.get(key)`.
  - An extension writes only its own keys, with `ctx.settings.set(key, value, { scope: 'global' | 'workspace' })`; another extension's key fails `NOT_PUBLIC` (ADR 0009, 24).
  - The user changes any key with `kernel.settings.set`.
- The kernel's own keys are `kernel.port` (3737), `kernel.workers`, `kernel.workerConcurrency` (32), `kernel.language` (default `en`, §2.11), `kernel.jobs.retentionDays` (7), and `kernel.web.home` (`kvwebui`, §4.1). They are global only. `kernel.port`, `kernel.workers`, and `kernel.workerConcurrency` apply at the next start.

**Secrets.**
- `ctx.secrets.get/set/delete(name)` belong to the calling extension and are home-wide. They're stored in `secrets.json`: mode 0600 on Linux and macOS, and protected by the user profile folder's access rules on Windows. Writes replace the file atomically.
- A secret is never written to SQLite, settings, job rows, logs, or any HTTP response. The user sets and deletes secrets with `kernel.secrets.*`, which never returns a value. `kernel.secrets.set` runs only as a sync call: `async` or a schedule fails `VALIDATION_FAILED`, so the value never lands in a job row.
- In `kernel.secrets.*`, `extension` is the package name (as in `caller.name`) of an extension of the run (`NOT_FOUND` otherwise). Deleting a missing secret does nothing (ADR 0009, 29).

## 2.9 Extensions

**Package.** An extension is a package whose `package.json` has `main` and a `kvman` field:

```json
{ "name": "@kvman/kvcoder", "version": "0.1.0", "main": "dist/index.js",
  "peerDependencies": { "@kvman/sdk": "^0.1.0" },
  "kvman": { "namespace": "kvcoder", "source": "src/index.ts",
             "dependencies": { "@kvman/kvai": "^0.1.0", "@kvman/kvwebui": "^0.1.0" } } }
```

**The SDK.** An extension lists `@kvman/sdk` as a peerDependency. The kernel resolves every extension's `@kvman/sdk` import to its own copy (a Node module resolve hook), so all extensions share one SDK and one zod. Extensions build their schemas with the SDK's `z`, never their own zod.

**TypeScript entries.** `kvman.source` is optional. (The kernel turns off V8's wasm code GC at start, working around a V8 crash in the shared wasm code of Node's type stripper; ADR 0009, 20.) For a `path:` extension, the kernel loads `source` when it's present, with Node's type stripping (erasable syntax only: no enums, namespaces, or parameter properties); otherwise, and always for `bundled` and `npm:`, it loads `main`.

**Web files.** An extension may add `"web": "<folder>"` to its `kvman` field, and the kernel serves that folder at `/web/<namespace>/` (§4.1). This is how kvwebui ships its app and how extensions ship Vue components.

**Entry.** The entry (`main`, or `source`) default-exports `(ctx) => void`, which registers the extension's commands, queries, and settings (§3.1). It runs in every worker when the worker loads.

**Sources** (named in the preset, §2.10):
- `bundled`: a core extension shipped with kvman.
- `npm:<exact version>`: the kernel runs `npm install --ignore-scripts --omit=dev --legacy-peer-deps --prefix extensions/<name>@<version> <name>@<version>` (skipping peers, since the kernel supplies `@kvman/sdk`). npm must be on the PATH. A failed install fails `EXTENSION_INVALID` and removes the partial folder (ADR 0009, 47).
- `path:<folder>`: a local folder, relative to the preset file.

**Trust.**
- A non-bundled version is loaded only after it's accepted. At start, kvman lists the name, version, and source of each version not yet accepted, and asks y/N in the terminal.
- `--yes` accepts them. Accepted versions are remembered in SQLite, and a new version asks again.
- With no terminal and no `--yes`, kvman refuses to start. Refusing, and any answer but `y`, fail `EXTENSION_INVALID`. A `path:` version is remembered by its absolute folder (ADR 0009, 48).

**Loading.** Extensions load in dependency order. kvman stops with `EXTENSION_INVALID` (§2.14) when:
- the manifest is invalid: no `main`, no `@kvman/sdk` in `peerDependencies`, or an unknown key in the `kvman` field (ADR 0009, 6);
- a dependency is missing or out of range (ranges are checked with `semver`);
- the extension's `@kvman/sdk` peer range doesn't include the kernel's sdk version;
- dependencies form a cycle (the message prints it, for example `@a/x → @b/y → @a/x`);
- two extensions claim one namespace, or an extension claims `kernel`, the kernel's own (ADR 0009, 32);
- a registered name doesn't start with `<namespace>.`;
- a name is registered twice;
- a registration is invalid (for example, no description);
- an entry throws.

Registrations are sealed when the entry returns: a later `register*` call fails `EXTENSION_INVALID` (ADR 0009, 12).

**Hot reload.**
- A `path:` extension's folder is watched (`node:fs` `watch`, recursive, ignoring `node_modules`). Events are batched until 200 ms pass without one (ADR 0009, 26). On a change, the kernel starts fresh workers, which load every extension with the new code. The old workers take no new jobs and exit when their running jobs end, so running jobs finish on the old code. (ES modules can't be unloaded, so a worker never reloads in place.)
- A reload that fails keeps the previous code and workers, and logs the error. It fails when the reloaded extension's own manifest breaks a start rule (its namespace, its sdk range, its own dependencies), or when its entry fails to load. Each reload logs `extension reloaded` or `extension reload failed`.
- After a reload, the `kernel.started` handlers of the reloaded extension and of every extension that depends on it, directly or not, run again in dependency order (§2.15).
- A reload doesn't touch the extensions that depend on it. If the new version no longer satisfies a dependent's range, or drops a name a dependent calls, the reload still applies, a warning is logged, and those calls fail `NOT_FOUND`. The start-time checks apply again at the next start.

**Access.**
- A registration is private by default: only its own extension can call it.
- With `public: true`, other extensions and HTTP clients can call it too. Calling a private name from outside fails with `NOT_PUBLIC`.
- `public` is the only check between extensions: a caller doesn't have to declare the callee as a dependency. Declared dependencies are for presence and version checks, load order, and imports.
- **Registering with another extension.** An extension that wants others to register things with it (kvcoder's connectors) exposes public commands, and stores entries in its own store keyed by the caller. An owner that only reads from others pulls instead, from public queries named under the other's namespace (`<namespace>.ui.get` for kvwebui, `<namespace>.docs.list` and `.docs.get` for kvcustomizer, plan 09 §9.5), so it needs no load order. Contributors call them from their `kernel.started` handler (§2.15).

## 2.10 Presets

```json
{ "name": "coder",
  "extensions": { "@kvman/kvai": "bundled", "@acme/x": "npm:1.2.3", "@me/y": "path:../y" },
  "settings": { "kvai.defaultModel": "anthropic/claude-sonnet-5-5", "kvwebui.home": "kvcoder.chat" } }
```

- A preset is the whole app for one run: which extensions load, and the preset-level value of any setting.
- The app's UI shape is kvwebui's own settings; the kernel knows no UI concept.
- A preset is validated at start, and its settings again once the extensions have loaded (§2.8). An invalid preset stops kvman with `VALIDATION_FAILED`.
- The one bundled preset is `coder` (the default). A person's own presets live in `<home>/presets/` (§1.2); one named like a bundled preset replaces it (ADR 0010, 4).
- **Editing.** A preset is changed by writing its file, and a change applies at the next start; nothing is installed, loaded, or trusted by the edit itself (ADR 0010, 5):
  - the file written is the person's: `<home>/presets/<name>.json` for a home preset, the given file for `--preset ./file.json`, and for the bundled preset its copy at `<home>/presets/<name>.json`, made at the first edit;
  - `npm install` and the trust question happen at the next start, as for any preset (§2.9);
  - `kernel.settings.set` still changes a setting at once and is not an edit of the preset.
- **The backup** (ADR 0024, 4 and 5). The first edit after a good start writes the preset as it was running to `<file>.good` beside the file, unless that file exists; later edits before the next start keep it, and a first edit of the bundled preset backs up the bundled one. A start that succeeds, with its HTTP port listening, deletes it. A start that fails with `EXTENSION_INVALID` or `VALIDATION_FAILED` while it exists restores the file from it and starts once more (§2.14).

## 2.11 Localization

- **Catalogs.** The kernel and each extension ship `locales/<lang>.json` files: a flat JSON object of strings, `{ "<namespace>.x.y": "text" }`, with every key under the owner's namespace. An unreadable catalog, or a key outside the namespace, fails the load with `EXTENSION_INVALID` (ADR 0009, 25). kvman's own packages ship `en` and `ar`; an extension may ship any other language too. Placeholders use vue-i18n's `{name}` syntax.
- **Conventions.**
  - Error texts are `<namespace>.errors.<CODE>`.
  - A setting's, command's, or query's translated description is `<name>.description`, and a form field's label is `<command>.fields.<field>`. When a key is missing, the UI shows the registered English description.
  - A setting's short title is `<key>.title`, and a namespace's display name is `<namespace>.title`; when either is missing, the UI shows the key or the namespace (ADR 0009, 77).
  - A setting's choice is named `<key>.options.<value>`, for a value that is a string; when it is missing, the UI shows the value (ADR 0013, 4).
- **Serving.** The kernel merges the catalogs per language and serves them at `GET /api/locales/:lang`. A key missing in a language falls back to `en` (the served catalog is `en` overlaid with the language), then to the key itself (the UI shows a missing key). A code no loaded catalog has fails `NOT_FOUND` (ADR 0009, 31).
- **The language** is `kernel.language` (global, default `en`): any language code (BCP 47, such as `fr` or `pt-BR`) that a loaded catalog has; anything else fails `VALIDATION_FAILED`. The kernel lists the available languages in `kernel.health.get`. `ar`, `he`, `fa`, and `ur` are right-to-left, and the UI follows the setting.
- Text sent to a model stays English; a harness asks the model to reply in `kernel.language`.

## 2.12 The kernel's own commands and queries

All are public. Types are in `@kvman/sdk`.

| Name | Kind | Input → output |
|---|---|---|
| `kernel.workspace.open` | command | `{ path }` → `Workspace`: the existing one if that path is open, the remembered one if it was open before (§2.6) |
| `kernel.workspace.close` | command | `{ workspaceId }` → `{}`: pauses it (§2.6); Home can't be closed (`VALIDATION_FAILED`) |
| `kernel.workspace.list` | query | `{}` → the open `Workspace[]`, Home first, then in the order they were first opened |
| `kernel.folder.list` | query | `{ path?, hidden? }` → `{ path, parent, folders: [{ name, path }], truncated }`: the sub-folders of a folder on this machine, for choosing a workspace folder (ADR 0009, 219) |
| `kernel.folder.create` | command | `{ path, name }` → `{ path }`: makes the folder `name` inside the existing folder `path` and answers its real path; `name` is one folder name (ADR 0009, 222) |
| `kernel.settings.set` | command | `{ key, value, scope: 'global' \| 'workspace' }` → `{}` |
| `kernel.settings.reset` | command | `{ key, scope }` → `{}` |
| `kernel.settings.list` | query | `{}` → `[{ key, description, schema, scopes, value, source }]`, where `schema` is JSON Schema and `source` is `workspace`, `global`, `preset`, or `default` |
| `kernel.secrets.set` | command | `{ extension, name, value }` → `{}`; sync only (§2.8) |
| `kernel.secrets.delete` | command | `{ extension, name }` → `{}` |
| `kernel.secrets.list` | query | `{}` → `[{ extension, name }]` (never values) |
| `kernel.jobs.get` | query | `{ id }` → `Job`, of any workspace |
| `kernel.jobs.list` | query | `{ status?, limit }` → `Job[]` in this workspace, newest first |
| `kernel.files.get` | query | `{ id }` → `File` of this workspace |
| `kernel.files.list` | query | `{ limit }` → `File[]` in this workspace, newest first |
| `kernel.files.unlink` | command | `{ id }` → `{}`: a file of this workspace, with the access rules of §2.7 |
| `kernel.extensions.list` | query | `{}` → `[{ name, version, source, revision, namespace, commands, queries, settings, handlers }]` (`source` is the preset's `bundled`, `npm:…`, or `path:…`; `revision` starts at 0 and grows with each hot reload); each command and query, private ones too, is `{ name, description, public, input, output }`, with `input` and `output` as JSON Schema; each setting is `{ key, description, scopes }` and each handler `{ point, description }`; the kernel itself isn't listed (ADR 0009, 28) |
| `kernel.registrations.list` | query | `{}` → `[{ name, kind: 'command' \| 'query', extension, public, description }]`: every command and query of the run's extensions, private ones too, with the package name of its owner and no schema; for a caller that only needs to know what exists and whose it is (ADR 0011, 25) |
| `kernel.preset.get` | query | `{}` → `{ name, origin: 'bundled' \| 'home' \| 'file', file?, extensions, settings }`: the running preset as stored now, so after an edit it shows the change before the restart; `file` is the file an edit writes (absent for `bundled` until the first edit) (ADR 0010, 5) |
| `kernel.extensions.install` | command | `{ source }` → `{ file, restartRequired: true }`: adds the extension to the preset's `extensions`; `source` carries the name: `bundled:<name>` (only for a bundled extension; any other name fails `VALIDATION_FAILED`), `npm:<name>@<exact version>`, or `path:<folder>`, whose name is the `name` of the folder's package.json. The preset stores `bundled`, `npm:<exact version>`, or `path:<folder>` under that name (§2.10). A folder is resolved against the folder of the preset file written, and one without a readable package.json and a valid `name` fails `VALIDATION_FAILED`. A bad source, an input with `name`, or a name already in the preset fails `VALIDATION_FAILED` (ADR 0010, 5; ADR 0025) |
| `kernel.extensions.uninstall` | command | `{ name }` → `{ file, restartRequired: true }`: removes `name` from the preset's `extensions`. `NOT_FOUND` when it isn't there; `VALIDATION_FAILED`, naming the dependents, when another extension of the preset depends on it (ADR 0010, 5) |
| `kernel.restart` | command | `{}` → `{ restarting: true }`: asks the run to restart and answers at once (§2.14, ADR 0024, 2) |
| `kernel.processes.list` | query | `{}` → `[{ extension, workspaceId, name, pid, startedAt }]` (§2.16) |
| `kernel.health.get` | query | `{}` → `{ version, preset, mode, workers, uptimeMs, languages, rolledBack? }`: kvman's version, the preset's name, `web`, the pool size, the uptime on the kernel's clock, the codes the loaded catalogs have (ADR 0009, 29), and, only for a start that came after an undone one, the Problem that start failed with (ADR 0024, 5 and 6) |

There is no sandbox in this phase, so extensions can call these too.

**JSON Schema.** Schemas are converted with zod's `z.toJSONSchema`: inputs and settings in its `input` mode, outputs in its `output` mode. A part JSON Schema can't express becomes `{}` (ADR 0009, 23).

## 2.13 Limits

Going over a limit fails loudly and never cuts anything off.

| Limit | Value | Error |
|---|---|---|
| Job input or output | 1 MiB of JSON by default; a registration may set `maxInputBytes` and `maxOutputBytes` up to 32 MiB | `TOO_LARGE` |
| Progress chunk | 64 KiB | `TOO_LARGE` |
| Progress replay per running job | 256 KiB; the oldest chunks are dropped (ADR 0009, 139) | — |
| File | 1 GiB | `TOO_LARGE` |
| Store document or kv value | 16 MiB of JSON | `TOO_LARGE` |
| `find` and `list` limits | required, at most 1000 | `VALIDATION_FAILED` |
| Sync `ctx.exec` depth | 16 | `TOO_DEEP` |

## 2.14 Start and stop

**Start.** Each step must succeed; any failure prints the Problem and a hint, then exits with code 1.
1. Take `kvman.lock`. If a live kvman holds it, hand over or fail `KVMAN_RUNNING` (§1.2); a lock whose process isn't alive is replaced.
2. Open the database.
3. Read and validate the preset.
4. Install missing npm extensions.
5. Ask for trust.
6. Start the workers, which load the extensions (`EXTENSION_INVALID`). In `web` mode, the extension whose namespace is `kernel.web.home` must exist and declare `kvman.web` (`EXTENSION_INVALID` otherwise), checked where kvman starts HTTP (ADR 0009, 41).
7. Check the preset's settings against the registered keys, including required keys (`VALIDATION_FAILED`, §2.8).
8. Delete expired job rows. Attempts that were running when kvman last stopped or died fail with `INTERRUPTED` (§2.3). Then resume queued jobs and due schedules of open workspaces.
9. Open the start folder as a workspace (§1.2).
10. Run the `kernel.started` handlers in dependency order (10 s budget; a failure is logged, and start goes on).
11. Listen on the port (`PORT_IN_USE`), then print the URL and open the browser.

**Stop (Ctrl+C).**
1. HTTP stops taking requests.
2. The `kernel.stopping` handlers run.
3. Every running job's signal is aborted with the reason `shutdown`.
4. kvman waits up to 10 s for handlers to return, then stops the workers. Every process from §2.16 is stopped (§2.16), with the kill at the 10 s mark.
5. Async attempts that didn't finish fail with `INTERRUPTED`: a job with retries left stays queued and runs at the next start; one without ends `failed` (§2.3).

SIGTERM stops the same way, and kvman exits 0. A second Ctrl+C or SIGTERM stops at once, with exit code 130 (ADR 0009, 50).

**Restart** (ADR 0024). `kernel.restart` makes kvman run the stop sequence above, then the start sequence again, in the same process: the same arguments, the same lock (its port updated), the same terminal, and no new browser tab. It prints `kvman is restarting…`, then the URL. Running jobs are aborted, and an attempt that didn't finish fails `INTERRUPTED` (§2.3); processes (§2.16) are stopped; open workspaces are remembered (§2.6) and open again. The preset is read again at step 3.

**A start that fails because of the preset is undone** (ADR 0024, 5). When the start fails with `EXTENSION_INVALID` or `VALIDATION_FAILED` and the backup `<file>.good` exists (§2.10), the CLI restores the file from it, prints the Problem and `The last change to the preset was undone.`, and starts once more; that start's `kernel.health.get` has `rolledBack`. A second failure prints its Problem and exits 1; a start that fails for another reason, such as `PORT_IN_USE`, prints its Problem and exits 1, and the backup stays.

## 2.15 Handler points

The kernel owns a fixed set of points. An extension registers a handler for a point in its boot function:

```ts
ctx.registerHandler('kernel.job.failed', {
  description: 'Records failed jobs.',
  handle: async (info) => { /* … */ },
  retries: 3, timeoutMs: 600_000,          // optional, as for commands
});
```

| Point | Occurs | Handler input |
|---|---|---|
| `kernel.job.failed` | any job, sync or async, ends `failed` | `{ jobId, rootId, name, caller, workspaceId, problem, attempts }` |
| `kernel.job.succeeded` | an async or scheduled job ends `succeeded` | `{ jobId, rootId, name, caller, workspaceId }` |
| `kernel.job.cancelled` | any job ends `cancelled` | `{ jobId, rootId, name, caller, workspaceId, reason }` |
| `kernel.process.exited` | a process from §2.16 exits by itself | `{ extension, workspaceId, name, exitCode, signal }` |
| `kernel.workspace.opened` | a path becomes a workspace for the first time (Home: on the first start of a new home); reopening doesn't count | `{ workspaceId }` |
| `kernel.started` | once per start, after every extension loads and before HTTP starts; again after a hot reload, for the reloaded extension and its dependents | `{}` |
| `kernel.stopping` | at the start of shutdown | `{}` |

The three job points share the base `{ jobId, rootId, name, caller, workspaceId }`. Handler inputs never include a job's input or output. An unknown point fails the load with `EXTENSION_INVALID`.

- **Delivery.** Each occurrence queues one async job per registered handler, in the same SQLite transaction that records the job's end (for a sync job, which has no row, the transaction that inserts the handler jobs), so a crash never loses or duplicates a handler call.
- **Handler jobs.** They are ordinary async jobs, with retries and timeouts. Their caller is `{ kind: 'kernel' }`, and their workspace is the job's (the opened one for `workspace.opened`; Home for `started` and `stopping`).
- **Loop safety.** A handler job, its nested sync jobs, and every async job or schedule they create carry a `fromHandler` mark, inherited down the chain. Marked jobs never trigger handlers, so no chain can loop.
- **Started.** kvman runs the `kernel.started` handlers before it starts HTTP, in dependency order, with a 10 s budget. A handler that fails is logged, and kvman still starts. Handlers still running when the budget ends keep running after HTTP starts. A `path:` hot reload runs the handlers of the reloaded extension and of every extension that depends on it again, in dependency order.
- **Stopping.** `kernel.stopping` handlers run at the start of shutdown, before running jobs are aborted, within the 10 s budget. Unfinished ones are dropped, not resumed.

## 2.16 Processes

The process service is for long-lived child processes, such as kvcustomizer's preview kvman. Short ones, such as a kvcoder shell call, stay plain `node:child_process` inside their job.

| Call | Does |
|---|---|
| `ctx.processes.start(name, { command, args?, cwd?, env? })` | Starts it (in its own process group on Linux and macOS) → `{ name, pid, startedAt }`. The name is unique per extension and workspace; a running one fails `PROCESS_RUNNING`. Commands only (`READ_ONLY` in queries). A command that can't start fails `VALIDATION_FAILED` (ADR 0009, 33). |
| `ctx.processes.stop(name)` | Linux and macOS: SIGTERM to its group, then SIGKILL after 5 s. Windows: `taskkill /PID <pid> /T /F` at once. Commands only (ADR 0009, 34). |
| `ctx.processes.list()` | This extension's processes in the workspace. |
| `ctx.processes.log(name, { tail? })` | The last lines of its output. |

- **Options.** `cwd` defaults to the workspace folder, and a relative `cwd` resolves against it; `env` is merged over kvman's own environment (ADR 0009, 27).
- **Names.** A process name is lowercase kebab case, such as `preview` (`VALIDATION_FAILED` otherwise; ADR 0009, 30).
- **Output.** stdout and stderr go to `logs/processes/<extension>/<workspaceId>/<name>.log`, capped at 10 MB with the oldest half dropped. Each start truncates the log. `log`'s `tail` defaults to 100 lines; a name that never ran fails `NOT_FOUND`.
- **Listing.** `list()` and `kernel.processes.list` show running processes only. `stop` of an unknown or exited name fails `NOT_FOUND`, and resolves once the process has exited.
- **Exit.** A process is recorded in SQLite while it runs. One that exits by itself triggers `kernel.process.exited` (§2.15), whoever started it: a process isn't a job, so the `fromHandler` mark doesn't apply.
- **Stop.** On kvman stop, after the `kernel.stopping` handlers, every process is stopped: SIGTERM to each group, then SIGKILL at the 10 s mark (Linux and macOS), or `taskkill /T /F` (Windows).
- **Crash.** At the next start, the kernel kills the leftover recorded processes that are still alive (their groups, or their trees on Windows) and clears their rows.
- **Hot reload** leaves processes running.
- `kernel.processes.list` lists every process, for the UI.

