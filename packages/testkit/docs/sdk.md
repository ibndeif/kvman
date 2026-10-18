# The extension API (`@kvman/sdk`)

`@kvman/sdk` is the whole API an extension sees: the `ctx` its entry receives, and the SDK's `z` (zod 4). Everything else it reaches is a public command or query of the kernel or of another extension, called through `ctx.exec`. Read `conventions` first.

## The package

```json
{ "name": "notes", "version": "0.1.0", "type": "module", "main": "dist/index.js",
  "peerDependencies": { "@kvman/sdk": "^0.1.0" },
  "devDependencies": { "@kvman/sdk": "<version>", "@kvman/testkit": "<version>", "@kvman/kvcoder": "<version>" },
  "kvman": { "namespace": "notes", "source": "src/index.ts", "dependencies": { "@kvman/kvcoder": "^<version>" } } }
```

- `main` and the `@kvman/sdk` peer are required. At runtime every extension shares kvman's own SDK and `z`, so never add zod yourself.
- The `kvman` field takes only `namespace` (lowercase, kebab-case words), `source` (the TypeScript entry that a `path:` extension loads with no build, erasable syntax only: no enums, namespaces, or parameter properties), `web` (a folder of built web files, served at `/web/<namespace>/`), and `dependencies`. Any other key fails the load.
- `dependencies` maps each extension yours calls or registers with to a semver range: `"@kvman/kvcoder": "^0.1.7"`. kvman then refuses to start without it or with a version out of range, and loads it first, so your `kernel.started` handler runs after its own. A call between extensions needs only `public: true`; declare the dependency whenever your extension can't work without the other.
- Install each dependency as an exact devDependency: `npm install --save-dev --save-exact @kvman/kvcoder@<version>`, with the version the running kvman has. `npm run check`, `npm test`, and `createTestKernel` load it from `node_modules` with your project.

## The entry

`src/index.ts` default-exports one function of `ctx`. It only registers, once in every worker; registering later fails.

```ts
import { z, type Ctx } from '@kvman/sdk';

const note = z.object({ text: z.string(), done: z.boolean() });

export default (ctx: Ctx): void => {
  ctx.registerCommand('notes.note.add', {
    description: 'Adds a note to this workspace.',
    public: true,
    input: z.object({ text: z.string().min(1).describe('The note.') }),
    output: z.object({ id: z.string() }),
    handle: async (input) => ({ id: (await ctx.store.collection('notes', note).insert({ text: input.text, done: false })).id }),
  });
  ctx.registerQuery('notes.note.list', {
    description: 'Lists the notes of this workspace, newest first.',
    public: true,
    input: z.object({ limit: z.number().int().min(1).max(1000).describe('How many to list.') }),
    output: z.array(note.extend({ id: z.string() })),
    handle: (input) => ctx.store.collection('notes', note).find({}, { limit: input.limit, order: 'desc' }),
  });
  ctx.registerCommand('notes.done.clear', {
    description: 'Deletes the notes that are done.',
    input: z.object({}),
    output: z.object({ deleted: z.number() }),
    handle: async () => {
      const notes = ctx.store.collection('notes', note);
      const done = await notes.find({ done: true }, { limit: 1000 });
      for (const entry of done) await notes.delete(entry.id);
      return { deleted: done.length };
    },
  });
  ctx.registerSetting('notes.greeting', { description: 'The greeting shown above the notes.', schema: z.string(), default: 'Hello' });
  ctx.registerHandler('kernel.started', {
    description: "Clears Home's done notes every night.",
    handle: async () => {
      await ctx.schedule('notes.done.clear', {}, { cron: '0 3 * * *', key: 'nightly' });
    },
  });
};
```

## Registrations

| Call | Takes |
|---|---|
| `ctx.registerCommand(name, …)` | `description`, `input`, `output`, `handle(input)`, and optionally `public` (default `false`), `retries` (default 3), `timeoutMs` (default 600 000), `syncOnly` (default `false`; required when the input holds a secret, so it never lands in a job row), `maxInputBytes` and `maxOutputBytes` (default 1 MiB, at most 32 MiB) |
| `ctx.registerQuery(name, …)` | the same, without `retries` and `syncOnly` |
| `ctx.registerSetting(key, …)` | `description`, `schema`, and optionally `default` (without one, the preset must set the key) and `scopes`: `['global', 'workspace']` (the default), `['global']`, or `[]` for a key only the preset sets |
| `ctx.registerHandler(point, …)` | `description`, `handle(input)`, and optionally `retries` and `timeoutMs` |

- Every name starts with `<namespace>.`, in lowercase kebab-case segments; a setting key's segments are lower camelCase (`notes.greeting`, `notes.maxItems`). A command ends in an imperative verb, a query in a read verb (`get`, `list`, `search`, `count`).
- Every registration has a one-sentence `description`, and every field of a public input a `.describe()`: the agent and the forms read them.
- The input is checked before `handle` runs and the output after it returns; a mismatch fails `VALIDATION_FAILED`. Use `z.json()` for an output that is any JSON, such as a `ui.get` answer.
- A broken rule, a name registered twice, or an entry that throws stops the load with `EXTENSION_INVALID`, which `npm run check` reports.

## Jobs

Everything runs as a job: a command may write; a query only reads, and a write, `execAsync`, `schedule`, or command call inside it fails `READ_ONLY`.

| Call | Does |
|---|---|
| `ctx.exec(name, input)` | runs a command or query now, on the same worker, and resolves to its output; nested calls share the caller's signal, at most 16 deep (`TOO_DEEP`) |
| `ctx.execAsync(name, input)` | queues a command as a row that survives a restart and retries; resolves to its job id |
| `ctx.schedule(name, input, { at: Date, key? } \| { cron, key? })` | runs a command once at a date, or on a cron; resolves to the schedule id. The same `key` again replaces that schedule, so schedule from `kernel.started` with a key. A schedule runs in the workspace of the job that made it, and `kernel.started` runs in Home |
| `ctx.schedule.cancel(id)` | deletes a schedule |
| `ctx.cancel(jobId)` | aborts a job's signal; it ends `cancelled` |
| `ctx.problem(code, params?)` | makes a `ProblemError` to throw, with `code` `<namespace>/UPPER_SNAKE` |

- **Failures.** An async attempt that throws something that isn't a Problem (`HANDLER_FAILED`), times out (`TIMEOUT`), or is cut off by a stop (`INTERRUPTED`) is retried with backoff; a Problem, yours or the kernel's, fails the job at once. A sync call is never retried. So write async handlers to be safe to run twice.
- **The current job.** Inside a handler, `ctx.job` is `{ id, rootId, workspace: { id, name, path }, caller, signal, progress(data) }`. `workspace.path` is the workspace folder, which `node:fs` may use; `caller` is `{ kind: 'user' }`, `{ kind: 'extension', name }`, or `{ kind: 'kernel' }`; `signal` aborts on cancel, timeout, or stop, so pass it to `fetch` and child processes; `progress(data)` streams JSON (at most 64 KiB a chunk) to whoever follows the job. Outside a handler, `ctx.job` fails `NO_JOB`.
- **Work ends with its job.** No `setInterval`, no `setTimeout` that isn't awaited, and no promise left running when `handle` returns. Long or later work is `execAsync` or `ctx.schedule`; a short child process is killed on cancel; a long-lived one is `ctx.processes`.
- **No state in memory.** Each job may run on another worker, and workers restart; anything that lasts goes in the store.
- **Calling another extension.** `ctx.exec('kvai.complete', { … })` runs any public command or query. Its input and output are what `kvman extensions-get` or its docs pages give. For typed calls, `import type {} from '@kvman/kvai'` (a dependency you declared and installed); otherwise the output is `unknown`, so parse it with `z`.

## Handler points

`ctx.registerHandler(point, …)` runs `handle(input)` as an async job of the kernel when kvman reaches a point. There are no other events or listeners.

| Point | When | Input |
|---|---|---|
| `kernel.started` | each start, after every extension loaded; again after a hot reload of yours or of a dependency | `{}` |
| `kernel.stopping` | at the start of shutdown, within 10 s | `{}` |
| `kernel.workspace.opened` | a folder becomes a workspace for the first time | `{ workspaceId }` |
| `kernel.workspace.deleted` | a closed workspace is deleted | `{ workspaceId }` |
| `kernel.job.failed` | any job ends failed | `{ jobId, rootId, name, caller, workspaceId, problem, attempts }` |
| `kernel.job.succeeded` | an async or scheduled job succeeds | `{ jobId, rootId, name, caller, workspaceId }` |
| `kernel.job.cancelled` | any job is cancelled | `{ jobId, rootId, name, caller, workspaceId, reason }` |
| `kernel.process.exited` | a process of `ctx.processes` exits by itself | `{ extension, workspaceId, name, exitCode, signal }` |

A handler never sees a job's input or output, and work started by a handler triggers no handler.

## Storage, files, settings, secrets, processes

Every call returns a Promise, except inside a transaction.

| API | Calls |
|---|---|
| `ctx.store` (this workspace), `ctx.store.global` (every workspace) | `kv.get(key)` → the value or `undefined`, `kv.set(key, value)`, `kv.delete(key)`; `collection(name, schema)` with `insert(doc)` → the document with its `id`, `get(id)` → it or `undefined`, `find(filter, { limit, order?: 'asc' \| 'desc', after? })` (equality on top-level fields, `limit` at most 1000, `after` an id to continue from), `count(filter)`, `update(id, patch)` (top-level fields replace), `delete(id)`; a collection that grows is indexed by the field sets it is filtered by, declared in `package.json` as `kvman.indexes`, e.g. `{ "notes": [["owner"], ["owner", "pinned"]] }` |
| `ctx.store.transaction((tx) => …)` | runs synchronous `tx` calls (the same shape, `tx.global` too) in one transaction; returning a Promise fails |
| `ctx.files` | `write(name, data, type)` → `{ id, name, type, size, owner, workspaceId, createdAt }`, `get(id)`, `read(id)` → a Buffer, `path(id)`, `unlink(id)` (yours, or a person's upload) |
| `ctx.settings` | `get(key)` reads any key (workspace, else global, else preset, else default); `set(key, value, { scope: 'global' \| 'workspace' })` sets one of yours |
| `ctx.secrets` | `get(name)` → the string or `undefined`, `set(name, value)`, `delete(name)`: your own, kept only in `secrets.json` |
| `ctx.processes` | `start(name, { command, args?, cwd?, env? })` and `stop(name)` (in commands only), `list()`, `log(name, { tail? })`: long-lived child processes of this workspace, stopped when kvman stops |
| `ctx.log` | `debug`, `info`, `warn`, `error(message, fields?)` to kvman's log |

- Store data belongs to your extension only; a document read back is parsed with its schema, and one that no longer fits fails `VALIDATION_FAILED`. A document or value is at most 16 MiB of JSON, a file 1 GiB.
- Never log, store, or return a secret, and never log payloads or settings values.

## Testing

`npm test` runs `node --test` with `@kvman/testkit`, against a real kernel with a temporary home:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from '@kvman/sdk';
import { createTestKernel } from '@kvman/testkit';

test('notes.note.add stores a note', async () => {
  const kernel = await createTestKernel({ extensions: ['./'], settings: { 'notes.greeting': 'Hi' } });
  try {
    const { id } = z.object({ id: z.string() }).parse(await kernel.exec('notes.note.add', { text: 'Milk' }));  // as the person
    await kernel.exec('notes.note.list', { limit: 10 }, { as: '@acme/other' });                                // as another extension
    const jobId = await kernel.execAsync('notes.done.clear', {}, { as: 'notes' });                           // a private one, as itself
    assert.equal((await kernel.waitForJob(jobId)).status, 'succeeded');
    await kernel.clock.advance(24 * 60 * 60 * 1000);                                                           // schedules and retries run
    await kernel.restart();                                                                                    // stop and start on the same home
    assert.ok(id);
  } finally {
    await kernel.close();
  }
});
```

- `extensions` are folders loaded as `path:`; the dependencies they declare load from their `node_modules`. `settings` are the preset's values, and `secrets` is `{ "<package>": { "<name>": "<value>" } }`.
- `exec` and `execAsync` take `{ as?, workspaceId?, onProgress? }`. A call runs as the person, who reaches public names only (`NOT_PUBLIC` otherwise); `as` with your own package name reaches your private ones. `kernel.homeFolder` is the Home workspace's folder.
- The fake clock drives kvman's timers (schedules, retries, retention), not `Date` inside handlers.
