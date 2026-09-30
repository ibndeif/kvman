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
