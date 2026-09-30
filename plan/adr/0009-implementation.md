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
