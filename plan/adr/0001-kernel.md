# ADR 0001 — The kernel

Status: accepted, 2026-09-29. Decided with the product owner in question rounds 1–17. Later answers that supersede an earlier one are marked on the earlier one.

## Direction (from the product owner)

- kvman is an OS-like app for every kind of user, shaped by extensions and presets.
- The kernel wires everything: API, jobs, schedules, configs, settings, workspaces, file storage, extension management. Everything else is an extension.
- Core extensions only in this phase: kvai, kvwebui, kvinterviewer, kvcoder, kvdev.
- No hooks, events, or listeners: only commands, queries, and schedules, under extension namespaces.
- No sockets or RPC, no sandbox, nothing fancy in this phase.
- SDK sketch: `ctx.registerQuery`, `ctx.registerCommand`, `ctx.exec`, `ctx.execAsync`, `ctx.schedule`.

## Round 1–3 answers

1. **Codebase.** A new, short plan replaces `plan/`. The current code and the uncommitted M2.14 work move to the branch `archive/v2`; main restarts from an empty tree. Pieces are copied back only when a step needs them.
2. **Running.** `kvman --mode web --preset <preset>` is a foreground app: it starts the kernel (and, for `web`, the HTTP server), prints the URL, and stops on Ctrl+C. One kvman per home folder (lock file). No flags means `--mode web --preset coder`. Modes: `web` now, `tui` later. There are two default presets: the coding harness (the default) and dev (for developing extensions and presets).
3. **Naming.** "Preset" is kept. "Manifest" is left free for an extension's own description.
4. **Workspace.** A folder on disk that the user opens; one or more can be open. Jobs run with a workspace, file operations are relative to it, and its settings can override the home's. The preset is chosen per run and applies to every workspace.
5. **Jobs.** Commands, queries, and schedules are all jobs, run by the kernel's workers.
   - `ctx.exec` runs now and returns the result; it leaves no row.
   - `ctx.execAsync` and scheduled jobs are SQLite rows (input, status, result or error, times). They return an id, survive a restart, and run again if unfinished.
6. **Command vs query.** A query is read-only: it runs only with `ctx.exec`, can't write storage or run commands, and is never stored or scheduled. A command may write and can run sync, async, or on a schedule.
7. **Workers.** A shared pool of `worker_threads`, N = CPU cores − 1 by default (a setting). Each worker loads every enabled extension; any job runs on any free worker. A crashed worker fails its job and is replaced. Handlers keep no in-memory state between jobs.
8. **Database access.** Each worker opens its own better-sqlite3 connection to the one database (WAL, busy timeout). The main thread has its own.
9. **Transactions.** Each storage call commits on its own. `ctx.store.transaction(() => …)` groups writes in one synchronous block (no `await` inside). Async jobs may rerun after a crash, so handlers are written to be safe to repeat.
10. **Store API.** (Promise-based, see 49.)
    - `ctx.store.kv.get/set/delete`.
    - `ctx.store.collection(name)`: `insert`, `get`, `find` (equality filters and a `limit`), `update`, `delete`.
    - The kernel owns the tables. An extension sees only its own data, and there are no extension migrations.
11. **Files.** An upload or `ctx.files.write` stores `files/<id>` in the home plus a row (name, type, size, owning extension, workspace). Jobs pass the id; `unlink` deletes both. No deduplication, no garbage collection.

## Round 4–5 answers

12. **Defining an extension.** One `ctx` per extension, as sketched: `export default (ctx) => { ctx.registerCommand('kvai.model.add', { input, output, handle }) }`, and handlers call `ctx.exec(…)` on the same object.
13. **Current job.** The kernel tracks the running job with `AsyncLocalStorage`. Inside a handler, `ctx.store`, `ctx.files`, and `ctx.exec` use that job's workspace automatically, and `ctx.job` gives its id, workspace, and caller. Handlers are `handle(input)`. Using job-bound APIs outside a job fails with a clear error.
14. **Schemas.** Every command and query declares Zod `input` and `output`. The kernel validates both on every call. Types come from the schemas, and so does the JSON Schema used by kvai tools and web UI forms.
15. **Sources.** Bundled core extensions, npm packages, and local folders. (How npm is installed and confirmed is decided in round 6.)
16. **Data scope.** `ctx.store` is the job's workspace; `ctx.store.global` is home-wide. Both are the extension's own only.
17. **Worker concurrency.** A worker runs up to M jobs concurrently (a setting, default 32).
18. **Access.** Registrations are private by default (callable only by their own extension). `public: true` makes them callable by other extensions, and the web UI and other HTTP clients (the CLI only runs kvman, 35).
19. **HTTP API.** The kernel serves public commands and queries, and jobs, over HTTP on 127.0.0.1 with Host and Origin checks. kvwebui only adds static files; the kernel knows nothing about the UI. (Shapes: 57; static files: 59.)

## Round 6 answers

20. **npm install.** The kernel runs `npm install --ignore-scripts --omit=dev <name>@<exact version>` into `<home>/extensions/<name>@<version>/`. Presets pin exact versions. npm must be on the PATH.
21. **Trust.** At start, kvman lists the non-bundled extensions (name, version, source) that haven't been accepted yet and asks y/N in the terminal. `--yes` skips the prompt. Accepted versions are remembered in the home, and a new version asks again.
22. **Extension manifest.** The `kvman` field of package.json: `{ "namespace": "kvcoder", "dependencies": { "@kvman/kvai": "^1.0.0" } }`, with `main` as the entry. Dependencies load first. The kernel refuses to start when a dependency is missing or out of range, or when two extensions claim one namespace. Registered names must start with `<namespace>.`.
23. **Progress.** A handler reports progress with `ctx.job.progress(data)`. `GET /api/jobs/:id/stream` (Server-Sent Events) carries those chunks and then the final result or error. Nothing else is pushed; the UI reruns its queries when a job ends.

## Round 7 answers

24. **Schedules.** `ctx.schedule(type, input, { at })` runs a command once; `{ cron }` repeats it. Either returns an id; `ctx.schedule.cancel(id)` stops it. Schedules are rows in the workspace of the job that made them. A run that fell due while kvman was stopped runs once at the next start; missed repeats are not replayed.
25. **Failures.** A registration may set `retries` (default 3, exponential backoff from 1 s) and `timeoutMs` (default 10 minutes).
    - A thrown error or a timeout is retried; after the last attempt the job ends `failed` with its error.
    - `ctx.problem(code)` throws an error that is never retried.
    - Sync `ctx.exec` is never retried: the caller gets the error.
26. **Settings.** Keys are declared with a zod schema and a default: `ctx.registerSetting('kvai.defaultModel', { schema, default })`.
    - The value comes from the workspace, else the home, else the preset, else the default.
    - Read with `ctx.settings.get(key)`; set with the public `kernel.settings.set`.
    - Stored in SQLite. The kernel's own settings (port, workers, language) are `kernel.*`.
27. **Secrets.** `ctx.secrets.get/set/delete(name)`, per extension and home-wide, stored in `<home>/secrets.json` with mode 0600. They never go in SQLite, settings, job rows, logs, or HTTP responses. The web UI can set a secret but never read one back.

## Round 8 answers

28. **Errors.** Every failure is a Problem `{ code, message, params? }`.
    - Kernel codes are UPPER_SNAKE (`NOT_FOUND`, `VALIDATION_FAILED`, `NOT_PUBLIC`, `TIMEOUT`, `CANCELLED`, …).
    - Extension codes are `<namespace>/UPPER_SNAKE`, thrown with `ctx.problem(code, params)`.
    - The UI shows a translated text by code. (HTTP statuses: superseded by 57, the envelope.)
    - Unknown thrown errors become `HANDLER_FAILED`, and their message is not sent to the UI.
29. **Cancel.** `POST /api/jobs/:id/cancel` and `ctx.cancel(id)` cancel a job. Handlers get `ctx.job.signal` (AbortSignal). The job ends `cancelled` and is not retried. Nested `ctx.exec` jobs share the signal; `execAsync` jobs don't.
30. **OS access.** Plain Node APIs (`node:fs`, `node:child_process`); `ctx.job.workspace.path` gives the folder. The kernel adds no process service. Children stop with kvman (Ctrl+C reaches the process group), and handlers kill their own processes on cancel.
31. **Preset.** `{ name, extensions: { "<package>": "bundled" | "npm:<exact version>" | "path:<folder>" }, settings: { "<key>": value } }`. The UI shape is kvwebui's settings (`kvwebui.*`); the kernel knows no UI concept. `--preset coder` names a bundled preset; `--preset ./my.json` names a file.

## Round 9 answers

32. **Job workspace.** Every job has a workspace. The user's home folder is the built-in, always-open "Home" workspace. HTTP calls pass `workspaceId`, defaulting to Home. Folders are opened with the public `kernel.workspace.open { path }`, then listed and closed.
33. **HTTP auth.** Superseded by 58: there is no token.
34. **Hot changes.** The preset fixes the extensions for a run. A `path:` extension's folder is watched: on change, the workers reload it, its registrations are replaced, and running jobs finish on the old code.
35. **CLI.** Only running: `kvman [--mode web] [--preset coder] [--home <dir>] [--port <n>] [--yes]`, plus `--help` and `--version`.

## Round 10 answers

36. **Localization.** The kernel and each extension ship `locales/en.json` and `locales/ar.json`, with keys under their namespace; error texts are `<ns>.errors.<CODE>`. The kernel merges them and serves `GET /api/locales/:lang`. The language is the `kernel.language` setting (default `en`), and the UI follows it; Arabic is right-to-left.
37. **Packages.**
    - `packages/sdk`: ctx types, zod, and the shared shapes (preset, manifest, Problem, job).
    - `packages/kernel`: everything else, including HTTP.
    - `packages/cli`: the `kvman` bin; it runs the kernel in the same process.
    - `extensions/kvai`, `kvwebui`, `kvinterviewer`, `kvcoder`, `kvdev`, and `presets/coder.json`, `presets/dev.json`.
    - Extensions import only the sdk and their own npm dependencies, and talk to each other only through `ctx.exec`.
38. **Home.** `~/.kvman` by default (`--home` or `KVMAN_HOME` overrides). It holds `kvman.db`, `files/`, `extensions/`, `secrets.json`, `kvman.lock`, and `logs/kvman.log`. Logs are Pino JSON without payloads, settings values, or secrets; the terminal shows a short human-readable log.
39. **Process.** Unchanged: a scenario file per milestone, one test per scenario, the gates `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check`, a README row, and a commit per milestone.

## Round 11 answers (dependencies)

40. **HTTP server.** Hono (`hono` + `@hono/node-server`), latest stable, pinned exactly.
41. **Cron.** croner; the kernel asks it only for the next run and stores that on the schedule row.
42. **Uploads.** Raw body: `POST /api/files?name=…&workspaceId=…`, with `Content-Type` as the file's type, streamed to `files/<id>`; the call returns the file row. Downloads use `GET /api/files/:id`.
43. **Ids.** UUIDv7 from a small helper over `node:crypto`; tests inject the clock and the random source.
44. **Kept.** zod 4, better-sqlite3, Pino, Node 24.

## Round 12 answers

45. **Calling.** `ctx.exec(name, input)` runs a command or a query; a name is never both. `execAsync` and `schedule` accept only commands (`NOT_A_COMMAND` otherwise). Inside a query handler, `ctx.exec` can call only queries.
46. **Retention.** Finished job rows (succeeded, failed, cancelled) are deleted after `kernel.jobs.retentionDays` (default 7), at start and then hourly. Queued and running jobs are never deleted.
47. **Load failure.** If an extension's setup throws or a registration is invalid, kvman prints the extension, the error, and a hint, then exits with code 1. A `path:` extension that breaks during a hot reload keeps its previous code and logs the error.
48. **Limits.** Job input and output at most 1 MiB of JSON each, a progress chunk at most 64 KiB, a file at most 1 GiB, and `find` needs a `limit` of at most 1000. Going over fails with `TOO_LARGE` or `VALIDATION_FAILED` and a hint with the limit; nothing is cut off silently.

## Rounds 13–17 answers

49. **Async API.** `ctx.store`, `ctx.settings`, `ctx.secrets`, and `ctx.files` return Promises, so a later sandbox won't break extensions. Inside `ctx.store.transaction(fn)`, `fn` gets a synchronous `tx` with the same store shape.
50. **Call typing.** The SDK has empty `interface Commands {}` and `interface Queries {}`. An extension augments them for its public names and ships the types in its package. Unknown names take and return `unknown`. There's no generator; runtime validation still runs.
51. **Descriptions.** Every command, query, and setting has a required one-sentence `description`.
52. **Shutdown.** On Ctrl+C, HTTP stops taking requests and every running job's signal is aborted with the reason `shutdown`. kvman waits up to 10 s for handlers, then stops the workers. Unfinished async jobs stay `queued` for the next start. A second Ctrl+C stops at once.
53. **File access.** `ctx.files.get(id)` (row), `read(id)` (Buffer), `path(id)` (absolute path). Any extension reads any file of the job's workspace by id. Only the owner unlinks, except a user upload, which the user or any extension may unlink.
54. **Settings access.** Any extension reads any key. `ctx.settings.set(key, value, { scope: 'global' | 'workspace' })` writes only its own keys. The user changes any key with `kernel.settings.set`.
55. **Caller.** `ctx.job.caller` is `{ kind: 'user' }` or `{ kind: 'extension', name }`. A scheduled job's caller is the extension that scheduled it.
56. **Kernel API.** All public:
    - `kernel.workspace.open/close/list`
    - `kernel.settings.set/reset/list` (scope `'global' | 'workspace'`)
    - `kernel.secrets.set/delete/list` (names only)
    - `kernel.jobs.get/list`
    - `kernel.files.get/list/unlink`
    - `kernel.extensions.list`
    - `kernel.health.get`
57. **Envelope.** Commands and queries take `{ input, workspaceId?, async? }`. Every JSON response under `/api` is `{ ok: true, … }` or `{ ok: false, problem }`, with status 200. The exceptions: a file download is raw content, and an unparsable request is 400.
58. **Auth.** No token (supersedes 33). kvman listens only on 127.0.0.1, and a foreign Host or Origin is rejected.
59. **Static files.** Any extension may declare `"kvman": { "web": "<folder>" }`; the kernel serves it at `/web/<namespace>/`. The namespace named by `kernel.web.home` is also served at `/`, with `index.html` as the fallback for app routes (74).
60. **Job stream.** SSE events `progress`, then one `result` or `problem`, then close. Chunks aren't stored: a late client sees only new chunks, and a finished job answers at once.
61. **Port.** 3737 by default (`--port`, `kernel.port`). If it's taken, kvman fails with `PORT_IN_USE`.
62. **Trust without a terminal.** kvman refuses to start (exit 1) unless `--yes` is passed.
63. **Error catalog.** `VALIDATION_FAILED`, `NOT_FOUND`, `NOT_PUBLIC`, `NOT_A_COMMAND`, `READ_ONLY`, `NO_JOB`, `TOO_LARGE`, `TOO_DEEP`, `TIMEOUT`, `CANCELLED`, `WORKER_CRASHED`, `HANDLER_FAILED`, `PORT_IN_USE`, `EXTENSION_INVALID`, `KVMAN_RUNNING`.
64. **Ordering.** The kernel keeps none: queued jobs start first-in, first-out and run in parallel. Extensions guard one-at-a-time themselves.
65. **Depth.** A sync `ctx.exec` chain deeper than 16 fails with `TOO_DEEP`; an async job starts a new chain.

## Rounds 18–20 answers

66. **Collection update.** `update(id, patch)` merges shallowly: top-level fields in the patch replace the document's, others are kept, and `null` is stored as `null`. It resolves to the updated document.
67. **Rejected Host or Origin.** Status 200 with `{ ok: false, problem: { code: 'FORBIDDEN_ORIGIN' } }`; `params` never echo the caller's values.
68. **Naming.** Names are `<namespace>.<segment>…`, lowercase with kebab-case segments. Commands end in an imperative verb; queries end in a read verb (`get`, `list`, `search`, `count`).
69. **Kernel details.**
    - `kernel.workspace.open` on an open folder answers the existing workspace.
    - Home can't be closed (`VALIDATION_FAILED`).
    - A one-time schedule's row is deleted once its job is queued.
    - `kernel.jobs.list` and `kernel.files.list` return newest first.
    - A `transaction` callback that returns a Promise is rolled back with `VALIDATION_FAILED`.
70. **Files** are at most 300 lines (lint-enforced).
71. **Changesets** for `@kvman/sdk` and each extension only; the kernel and CLI follow the root version.
72. **Never relaxed:** secrets handling (only in `secrets.json`; never logged, stored elsewhere, or returned), and the 127.0.0.1 listener with Host and Origin checks. Other behavior (the trust prompt, `public` checks, read-only queries) is ordinary tested behavior.
73. **archive/v2** may be read and its code reused when a step needs it, adapted to the new plan; the new plan wins over old code.
74. **Web home.** `kernel.web.home` defaults to `kvwebui` (kvwebui's namespace). In `--mode web`, if no loaded extension with that namespace declares `kvman.web`, kvman refuses to start with `EXTENSION_INVALID`.

## From the kvwebui rounds

75. **Root job.** `ctx.job.rootId` is the id of the first job of a sync chain (the one started by HTTP, a schedule, or the async queue). It equals `ctx.job.id` for that first job and is inherited by nested `ctx.exec` calls.
76. **Job id in the envelope.** Command and query answers carry the job id: `{ ok: true, output, jobId }` and `{ ok: false, problem, jobId }`.
77. **Extension listing.** `kernel.extensions.list` returns each command and query as `{ name, description, public, input, output }`, with input and output as JSON Schema.
78. **Type-only imports.** See ADR 0002, 12.
79. **Nested progress.** `ctx.job.progress(data)` always goes to the stream of `ctx.job.rootId`. A chunk is `{ source: '<extension name>', data }`.
80. **Per-registration size caps.** A command or query may set `maxInputBytes` and `maxOutputBytes`: default 1 MiB, at most 32 MiB. Going over the registration's cap fails with `TOO_LARGE`. (Refines 48.)
81. **Dependency cycles.** A cycle in `kvman.dependencies` (A → B → A, or longer) stops kvman with `EXTENSION_INVALID`, printing the cycle (`@a/x → @b/y → @a/x`). Extensions can still call each other's public commands at runtime without declaring each other.
82. **Calls between extensions.** The kernel checks only `public`: any extension may call any public name. Declared dependencies are for presence and version checks at start, load order, and imports. There is no second lifecycle: an extension that offers a registry (kvcoder's connectors, sections, and binaries) is extended from the other extension's boot function through its helper, and reads those registrations when it needs them (ADR 0005, 5 and 10). Registering is the handover. An earlier answer requiring declared calls was withdrawn in favor of this.
83. **Hot reload and dependents.** Reloading a `path:` extension doesn't touch the extensions that depend on it; their calls reach the new registrations. If the new version no longer satisfies a dependent's range, or drops a name a dependent calls, the reload still applies, a warning is logged, and those calls fail `NOT_FOUND`. The start-time checks apply again at the next start.
