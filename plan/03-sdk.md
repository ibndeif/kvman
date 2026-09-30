# 03 — SDK (`@kvman/sdk`)

The SDK is the whole API an extension sees. It stays small and developer-friendly. Every public export has a one-line TSDoc comment, which is the API reference.

## 3.1 An extension

```ts
import { z, type Ctx } from '@kvman/sdk';

const note = z.object({ text: z.string() });

export default (ctx: Ctx) => {
  ctx.registerCommand('notes.add', {
    description: 'Adds a note to this workspace.',
    input: z.object({ text: z.string() }),
    output: z.object({ id: z.string() }),
    public: true,
    handle: async (input) => {
      const note = await ctx.store.collection('notes', note).insert({ text: input.text });
      return { id: note.id };
    },
  });

  ctx.registerQuery('notes.list', {
    description: 'Lists the notes of this workspace.',
    input: z.object({ limit: z.number().int().max(1000) }),
    output: z.array(z.object({ id: z.string(), text: z.string() })),
    public: true,
    handle: (input) => ctx.store.collection('notes', note).find({}, { limit: input.limit }),
  });

  ctx.registerSetting('notes.greeting', { description: 'The greeting shown above notes.', schema: z.string(), default: 'Hello' });
};
```

- The entry default-exports one function that receives the extension's `ctx`. It only registers, and it runs once per worker at load.
- `@kvman/sdk` is a peerDependency; at runtime every extension shares the kernel's copy, and so its `z` (§2.9).
- **Registrations.**
  - Commands and queries take `description`, `input`, `output`, `handle(input)`, and optionally `public` (default `false`) and `timeoutMs` (default 600 000).
  - Both may set `maxInputBytes` and `maxOutputBytes` (default 1 MiB, at most 32 MiB).
  - Commands also take `retries` (default 3) and `syncOnly` (default `false`): a sync-only command can't be queued or scheduled (`VALIDATION_FAILED`), so its input never lands in a job row. A command that takes a secret must be sync only (ADR 0009, 80).
  - Settings take `description`, `schema`, and optionally `default` (without it, the preset must set the key) and `scopes` (`['global', 'workspace']` by default, `['global']`, or `[]` for preset-only; §2.8).
  - `ctx.registerHandler(point, { description, handle, retries?, timeoutMs? })` registers a handler for one of the kernel's points (§2.15).
  - Every name starts with the extension's namespace. Every description is required and is one sentence.

## 3.2 Job calls

| Call | Does |
|---|---|
| `ctx.exec(name, input)` | Runs a command or query now and resolves to its output. |
| `ctx.execAsync(name, input)` | Queues a command and resolves to its job id. |
| `ctx.schedule(name, input, { at: Date, key? } \| { cron: string, key? })` | Schedules a command and resolves to the schedule id. The same `key` again replaces that schedule (§2.4). |
| `ctx.schedule.cancel(id)` | Deletes a schedule. |
| `ctx.cancel(jobId)` | Cancels a job (§2.3). |
| `ctx.problem(code, params?)` | Makes a `ProblemError` to throw (an `Error` carrying `.problem`). `code` is `<namespace>/UPPER_SNAKE`, and it is never retried. |

**Typing calls to other extensions.**
- The SDK declares empty `interface Commands {}` and `interface Queries {}`, which map each name to `{ input; output }`.
- An extension augments them for its public names and ships the declaration in its package. A caller then gets typed input and output after `import type {} from '@kvman/kvai'`. This type-only import is allowed only when the other extension is a `kvman.dependencies` entry and a devDependency. The only runtime import of another extension is a subpath it exports, and only from a declared dependency (§1.4).
- A name that isn't declared takes and returns `unknown`.
- **Web types.** `@kvman/sdk/web` exports the types of kvwebui's injected `kvman` object (`Kvman`, with its stream events) and of view trees, for custom components (§6.4, ADR 0009, 83). It is types only and imports nothing but the SDK.
- There's no generator, and the kernel validates at runtime either way.

## 3.3 The current job

`ctx.job` exists only while a handler runs; outside one it fails with `NO_JOB`.

| Field | Is |
|---|---|
| `id` | The job id (UUIDv7). A sync job has one too, but no row. |
| `rootId` | The id of the first job of this sync chain (the one started by HTTP, a schedule, or the async queue). It equals `id` for that job and is inherited by nested `ctx.exec` calls. |
| `workspace` | `{ id, name, path }`. |
| `caller` | `{ kind: 'user' }`, `{ kind: 'extension', name }`, or `{ kind: 'kernel' }` (handler jobs, §2.15). |
| `signal` | An `AbortSignal`, aborted on cancel, timeout, or shutdown. |
| `progress(data)` | Sends a progress chunk (JSON, at most 64 KiB) to the stream of `rootId`, as `{ source: '<extension name>', data }` (§4.4). |

## 3.4 Storage, files, settings, secrets

Every call returns a Promise, except the calls on a transaction's `tx`.

| API | Calls |
|---|---|
| `ctx.store`, `ctx.store.global` | `kv.get/set/delete(key)` (`get` → the value or `undefined`); `collection(name, schema)` (ADR 0009, 4) with `insert(doc)` → doc with `id`, `get(id)` → the document or `undefined`, `find(filter, { limit, order?: 'asc' \| 'desc' })`, `count(filter)`, `update(id, patch)` → the document (shallow merge: top-level fields in `patch` replace the document's, and `null` is stored as `null`), `delete(id)`; `transaction((tx) => …)` (§2.5) |
| `ctx.files` | `write(name, data, type)` (`data`: `Uint8Array` or string) → File, `get(id)`, `read(id)` → Buffer, `path(id)`, `unlink(id)` |
| `ctx.settings` | `get(key)` (typed through the augmentable `Settings` map, like `Commands`; `unknown` for an undeclared key), `set(key, value, { scope: 'global' \| 'workspace' })` (own keys only) |
| `ctx.secrets` | `get(name)` → the string or `undefined`, `set(name, value)`, `delete(name)` |
| `ctx.processes` | `start(name, { command, args?, cwd?, env? })`, `stop(name)`, `list()`, `log(name, { tail? })`: long-lived processes (§2.16) |

## 3.5 Logging

`ctx.log.debug/info/warn/error(message, fields?)` writes a line to `logs/kvman.log`, tagged with the extension and, inside a handler, the job id. `--log-level` sets the level (default `info`). `message` and `fields` never carry payloads, settings values, or secrets. `ctx.log` works outside a job too, for example in the entry function.
