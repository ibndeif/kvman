# ADR 0009 — Implementation decisions

Status: accepted, 2026-09-30. Questions that came up while building, decided with the product owner milestone by milestone.

## M1.1 Monorepo

1. **TypeScript 6.0.3.** The latest TypeScript (7.0.2, the native compiler) has no compiler API, and typescript-eslint supports only TypeScript below 6.1. The monorepo uses TypeScript 6.0.3 for typecheck, build, and lint, and the kvdev scaffold pins the same version. It moves to 7 when typescript-eslint supports it. This is an exception to "latest stable" (`CLAUDE.md` §5).
2. **Tooling.** Pinned exactly: ESLint 10.11.0 with typescript-eslint 8.71.0, Vitest 5.0.2 with its Vite 8.3.1 peer, @changesets/cli 3.0.3, and @types/node 24.19.0 (matching Node 24). The import walls are a rule of the repository's own (`eslint/`), as in archive/v2, not a plugin. There is no turbo: `pnpm -r` runs the package scripts in dependency order.
3. **The 300-line limit covers every file, tests included.** A big test suite splits into several files by topic.

## M1.2 SDK

4. **Collections take a schema.** `ctx.store.collection(name, schema)` takes a zod schema for its documents (without `id`). `insert` and `update` check the document against it (`VALIDATION_FAILED`), and every read parses through it, so a stored document that no longer fits fails `VALIDATION_FAILED` loudly. Documents are typed from the schema. Storage is unchanged: JSON text in the kernel's SQLite table, which extensions never see. `kv` stays untyped: `get` returns the JSON value, or `undefined` for a missing key.
5. **Times** in kernel rows (jobs, files, schedules, processes) are ISO 8601 strings, such as `2026-09-30T03:00:00.000Z`.
6. **Manifest checks.** Every extension lists `@kvman/sdk` in `peerDependencies`; a missing peer fails `EXTENSION_INVALID`. An unknown key in the `kvman` field fails `EXTENSION_INVALID` too.
7. **Shapes.**
   - `Workspace` is `{ id, name, path }`.
   - `Caller` is `{ kind: 'user' }`, `{ kind: 'extension', name }`, or `{ kind: 'kernel' }`.
   - `Job` is `{ id, name, input, workspaceId, caller, status, attempts, retries, output?, problem?, createdAt, startedAt?, endedAt? }`, with `status` one of `queued`, `running`, `succeeded`, `failed`, `cancelled`.
   - `File` is `{ id, name, type, size, owner, workspaceId, createdAt }`, with `owner` `{ kind: 'user' }` or `{ kind: 'extension', name }`.
   - `Problem` is `{ code, message, params? }`, with `params` a record of JSON values. `ctx.problem()` returns a `ProblemError` (an `Error` carrying `.problem`); throwing it fails the job with that Problem.
   - The envelope is `{ ok: true, …data }` or `{ ok: false, problem, jobId? }`.
   - `kv.get(key)` returns the value or `undefined`; `collection.get(id)` returns the document or `undefined`.
   - A `find` or `count` filter is equality on top-level fields, with `string`, `number`, `boolean`, or `null` values.
   - `ctx.files.write(name, data, type)` takes `data` as a `Uint8Array` or a string.
   - `ctx.secrets.get(name)` returns the string or `undefined`; `set(name, value)` takes a string.
   - `ctx.settings.get(key)` is typed through an augmentable `Settings` map, like `Commands`, and returns `unknown` for an undeclared key.
8. **Smaller shapes, settled while writing the SDK** (following the plan's wording):
   - `transaction` is on `ctx.store` only; its `tx` reaches the home-wide scope through `tx.global`, so one transaction covers both.
   - `ctx.job.progress(data)` returns nothing; an over-long chunk throws `TOO_LARGE` at once.
   - `ctx.processes.log(name, { tail? })` resolves to the text of the last lines.
   - `ctx.files.get(id)` of a missing id fails `NOT_FOUND`, like `kernel.files.get`.
   - The `kernel.job.cancelled` point's `reason` is a string; `kernel.process.exited` gives `exitCode` and `signal`, each `null` when absent (as Node reports them).
   - A preset's `settings` is optional, and an unknown preset key fails `VALIDATION_FAILED`, like the manifest's `kvman` field.
   - Namespaces are lowercase with kebab-case words (`kvai`, `kv-ai`), matching the naming rule for names.
   - The SDK's `Json` type lets an object field be `undefined`, which JSON leaves out, so schemas with optional fields (which zod infers as `field?: T | undefined`) fit the store, progress, and job calls.

## M1.4 Extensions and workers

9. **Versions.** kvman's packages start at 0.1.0, which signals pre-1.0 while nothing is published. The bundled extensions' `@kvman/sdk` peers and `kvman.dependencies`, the presets, and the kvdev scaffold use `^0.1.0`; the plan's examples are changed to match. 1.0.0 comes with the first stable release.
10. **Test workers.** `createTestKernel` uses `kernel.workers` 1 unless the test's `settings` set it; everything else is the kernel's default.
11. **Test Home.** A test kernel's Home workspace is a temporary folder of its own, beside the temporary kvman home, and both are removed on `close()`. Tests never touch the user's files.
12. **Registrations are sealed** when an extension's entry returns. A later `register*` call (for example, inside a handler) fails `EXTENSION_INVALID`, naming the extension, so every worker keeps the same registrations.
13. **Testkit options.** `settings` are the test run's preset settings (so required keys can be set), and `secrets` is `{ "<extension package>": { "<name>": "<value>" } }`, written to the temporary `secrets.json` before the extensions load.

## M1.5 Async jobs and schedules

14. **What retries.** An async attempt that fails `HANDLER_FAILED` (a thrown non-Problem), `TIMEOUT`, `WORKER_CRASHED`, or `INTERRUPTED` is retried with backoff while retries remain. Every other Problem, the kernel's or an extension's, ends the job `failed` at once: running it again would fail the same way.
15. **The test clock settles.** `await kernel.clock.advance(ms)` moves the fake time, fires the due retries and schedules, and resolves once no job is running or due; `advance(0)` waits for the current work.
16. **Test restart.** `await kernel.restart()` stops the test kernel as Ctrl+C does (unfinished attempts fail `INTERRUPTED`), then starts it again on the same home, Home folder, extensions, and settings, and resolves when it's ready. The fake clock carries over. `restart({ stoppedForMs })` moves the fake clock while the kernel is stopped, as time passes while kvman isn't running.
17. **Cancel.** A queued job ends `cancelled` at once, and its handler never runs. Cancelling a finished job does nothing. An unknown id fails `NOT_FOUND`. A running root job, sync or async, is aborted and ends `cancelled` when its handler settles, or at its timeout if it ignores the signal. A nested sync job's id is not a root and isn't cancellable on its own; it shares its root's signal.
18. **Dropped stopping handlers.** A `kernel.stopping` handler job that hasn't finished by the end of shutdown ends `failed` with `INTERRUPTED` and is never retried, so it is dropped, not resumed.
19. **Where rows are written.** Every job and schedule row is written by the main thread, which owns the kernel's clock, so ids, FIFO order, retries, and schedules follow one clock (the fake one in tests). A worker checks a call (the name, `NOT_A_COMMAND`, `NOT_PUBLIC`, `READ_ONLY`) and asks the main thread to queue it.
20. **V8's wasm code GC is off.** Worker threads crashed the process now and then (SIGSEGV, about one test file run in ten). gdb showed V8's wasm code GC freeing the machine code of a wasm module shared across isolates while another isolate still ran it (`NativeModule::FreeCode` from `Runtime_TierUpWasmToJSWrapper`). The wasm is Node's TypeScript stripper, which every worker runs to load `.ts` files. The kernel calls `v8.setFlagsFromString('--no-wasm-code-gc')` once at start, before any worker: 0 crashes in 54 runs. Stripping works as before; its compiled code (a few MB, shared) is never reclaimed. It is removed once a Node release fixes the V8 bug.
21. **SQLite syncs at `NORMAL`.** With `synchronous = FULL`, every commit waited for an fsync, and queued jobs ran at 324 jobs/s against the 500 target. With `NORMAL`, SQLite's usual setting for WAL mode, they run at about 700 jobs/s. A kvman crash or kill loses nothing, so every crash invariant (§12.2) holds; only a power loss or an OS crash can lose the last commits, and the database is never corrupted.

## M1.6 Workspaces, kernel API, localization, hot reload

22. **Workspace identity.** A workspace's id is a UUIDv7 and its name is its folder's basename (Home's too; the UI may label the id `home` with a translated key). `kernel.workspace.open` resolves the path with `realpath`, so a symlink or a trailing slash reopens the same workspace, and opening Home's own folder answers Home. `kernel.workspace.list` gives Home, then the others in the order they were first opened.
23. **JSON Schema.** `kernel.extensions.list` and `kernel.settings.list` convert zod schemas with zod's own `z.toJSONSchema`: inputs and settings in its `input` mode, outputs in its `output` mode. A part JSON Schema can't express (`z.date()`, `z.custom`, a transform's output) becomes `{}`. Validation stays zod's, so only a UI form gets vaguer.
24. **Ownership and scope.** `ctx.settings.set` of another extension's key, and unlinking a file the caller doesn't own, fail `NOT_PUBLIC`. `ctx.files.*`, `kernel.files.get`, `kernel.files.list`, and `kernel.files.unlink` see only the files of the call's workspace (`NOT_FOUND` otherwise). `kernel.jobs.get` finds a job of any workspace by id, as `GET /api/jobs/:id` does.
25. **Catalogs.** `locales/<lang>.json` is a flat JSON object of strings, `{ "<namespace>.x.y": "text" }`, and every key starts with its owner's namespace (`kernel.` for the kernel). An unreadable catalog, or a key outside the namespace, fails the load with `EXTENSION_INVALID`. The catalog of a language is `en` overlaid with that language; the last fallback, to the key itself, is the UI's (vue-i18n shows a missing key). Placeholders use vue-i18n's `{name}` syntax.
26. **Hot reload.** File events are batched until 200 ms (real time) pass without one; then one reload runs. It logs `extension reloaded` (with the extension and its revision) or `extension reload failed` (with the Problem's code). A reloaded extension whose own manifest now breaks a start rule (its namespace, its sdk range, its own dependencies) fails the reload and keeps the old code; only dependents' ranges and dropped names merely warn. Tests wait with `vi.waitFor` on what's public: a revision in `kernel.extensions.list`, or the log line. The testkit gains nothing.
27. **Processes.**
    - `cwd` defaults to the workspace folder, and a relative `cwd` resolves against it. `env` is merged over kvman's own environment.
    - Each start truncates the process's log, so the log shows the current run. `log`'s `tail` defaults to 100 lines.
    - `list()` and `kernel.processes.list` show running processes only: a process's row is deleted when it exits.
    - `stop` of an unknown or exited name fails `NOT_FOUND`, and `stop` resolves once the process has exited. `log` of a name that never ran fails `NOT_FOUND`; an exited process's log can still be read.
    - `kernel.process.exited` is delivered for every process that exits by itself. A process isn't a job, so the `fromHandler` mark doesn't apply.
28. **Extension list.** In `kernel.extensions.list`, `settings` is `[{ key, description, scopes }]` and `handlers` is `[{ point, description }]`. Private commands and queries are listed too (each carries `public`). The kernel itself isn't listed.
29. **Health and secrets.** In `kernel.health.get`, `version` is kvman's version (the kernel's), `preset` is the preset's name, `mode` is `web` (the only mode now; a test kernel reports `web` too), `workers` is the pool size, and `uptimeMs` is measured on the kernel's clock (the fake one in tests). `kernel.secrets.set` and `kernel.secrets.delete` name an extension of the run (`NOT_FOUND` otherwise), and deleting a missing secret does nothing, like `ctx.secrets.delete`.
30. **Process logs per workspace.** A process's name is unique per extension and workspace, so its log is `logs/processes/<extension>/<workspaceId>/<name>.log` (fixing `02` §2.16 and `01` §1.3, which shared one log across workspaces). A process name is lowercase kebab case, such as `preview` or `web-watch`; anything else fails `VALIDATION_FAILED`, so a name can't leave its folder.
31. **Unknown languages.** Only the languages in `kernel.health.get` have a catalog. The catalog of any other code fails `NOT_FOUND`, as `kernel.language` refuses such a code.
32. **The `kernel` namespace is reserved.** The kernel's names, keys, and error texts live under `kernel`, so an extension whose namespace is `kernel` fails the load with `EXTENSION_INVALID`, as when two extensions claim one namespace.
33. **A process that can't start.** `ctx.processes.start` whose command can't be started (not on the PATH, not executable, or a missing `cwd`) fails `VALIDATION_FAILED`, with the process name in `params` and the OS reason in the English message. No log file is kept for it.
34. **Stopping is a write.** `ctx.processes.stop`, like `start`, runs only in commands (`READ_ONLY` in queries); `list` and `log` are reads.

## M1.7 HTTP

35. **HTTP tests come with the CLI.** Plan 12 §12.1 runs HTTP tests against a real kvman child process, which only exists once the CLI does (M1.8). M1.7 writes every HTTP scenario, builds the routes, and unit-tests the pure parts (the Host and Origin check, body parsing and caps, the event stream's format, static paths); the route scenarios are tested in M1.8 through the CLI. The HTTP benchmark runs in M1.7, in-process, against a real listener.
36. **Origin matches its Host.** `Host` must be `127.0.0.1:<port>` or `localhost:<port>`. An `Origin`, when present, must be exactly `http://` plus that same Host, so a page on one name can't call the other. `Origin: null` is rejected.
37. **File routes name their workspace.** `POST /api/files` and `GET /api/files/:id` both require `?workspaceId=` (missing: `VALIDATION_FAILED`); a file of another workspace is `NOT_FOUND`. Commands and queries keep the Home default.
38. **Downloads are attachments.** `GET /api/files/:id` answers with the file's type, `Content-Disposition: attachment` with its name, and `X-Content-Type-Options: nosniff`, so a browser saves a file and never renders it on kvman's origin.
39. **Uploads.** An upload without `Content-Type` is stored as `application/octet-stream`. A missing or empty `name` fails `VALIDATION_FAILED`. Over 1 GiB fails `TOO_LARGE`, and the partial file is removed.
40. **Bodies.** The command or query is resolved before the body is read: an unknown name, the wrong route, or a private name fails `NOT_FOUND` or `NOT_PUBLIC`. The raw body is capped at the target's `maxInputBytes` and read no further past it (`TOO_LARGE`). A body that isn't JSON gets status 400 with the envelope (`VALIDATION_FAILED`). A JSON body of the wrong shape (strict `{ input, workspaceId?, async? }`; the queries route has no `async`) fails `VALIDATION_FAILED` at 200. A failure before a job starts carries no `jobId`.
41. **The web home.** When kvman's HTTP server starts (web mode, only through the CLI), the extension whose namespace is `kernel.web.home` must exist and declare `kvman.web`; otherwise the start fails `EXTENSION_INVALID`. A test kernel has no HTTP, so it isn't checked. A miss outside `/api` is a plain 404; an unknown `/api/…` route is the envelope with `NOT_FOUND`.
42. **The stream.** Each event is `event: progress`, `result`, or `problem`, whose `data:` is the JSON (`{ source, data }`, the output, or the Problem); then the stream closes. An unknown id, or a sync job's (which has no row), gets the envelope with `NOT_FOUND` instead of a stream. There is no heartbeat. A cancelled job ends with a `problem` event (`CANCELLED`).
