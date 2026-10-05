# The SDK

This page is for anyone writing an extension. It lists everything `ctx` can do, grouped, with a short example for each. When you finish, you can register commands, queries, settings, and handlers, call other extensions, and use the store, files, settings, secrets, processes, and logging.

Every public export of `@kvman/sdk` has a one-line TSDoc comment: that is the API reference, and this page is the guide.

## Registering

```ts
import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  ctx.registerCommand('notes.note.add', {
    description: 'Adds a note to this workspace.',
    input: z.object({ text: z.string().describe('The note.') }),
    output: z.object({ id: z.string() }),
    public: true,
    handle: async (input) => ({ id: (await ctx.store.collection('notes', z.object({ text: z.string() })).insert({ text: input.text })).id }),
  });

  ctx.registerQuery('notes.note.list', {
    description: 'Lists the notes of this workspace.',
    input: z.object({ limit: z.number().int().max(1000) }),
    output: z.array(z.object({ id: z.string(), text: z.string() })),
    public: true,
    handle: (input) => ctx.store.collection('notes', z.object({ text: z.string() })).find({}, { limit: input.limit }),
  });

  ctx.registerSetting('notes.greeting', { description: 'The greeting shown above notes.', schema: z.string(), default: 'Hello' });

  ctx.registerHandler('kernel.started', { description: 'Runs once per start.', handle: () => undefined });
};
```

| Option | For | Meaning |
|---|---|---|
| `description` | all | One sentence, required. |
| `input`, `output` | commands, queries | zod schemas; the kernel checks the input before the handler and the output after (`VALIDATION_FAILED` on a mismatch). |
| `public` | commands, queries | Default `false`. |
| `timeoutMs` | commands, queries, handlers | Default 600 000. |
| `maxInputBytes`, `maxOutputBytes` | commands, queries | Default 1 MiB, at most 32 MiB. |
| `retries` | commands, handlers | Default 3 (see [jobs.md](jobs.md)). |
| `syncOnly` | commands | Can't be queued or scheduled, so its input never lands in a job row. A command that takes a secret must be sync only. |
| `schema`, `default`, `scopes` | settings | `scopes` is `['global', 'workspace']` (default), `['global']`, or `[]` (preset-only). Without a `default`, the preset must set the key. |

Give every input field a `.describe()`: it becomes the label of a form field and the help text of a connector call.

## Calling jobs

| Call | Does |
|---|---|
| `ctx.exec(name, input)` | Runs a command or query now and resolves to its output. |
| `ctx.execAsync(name, input)` | Queues a command and resolves to its job id. |
| `ctx.schedule(name, input, { at: Date, key? } \| { cron: string, key? })` | Schedules a command. The same `key` again replaces the schedule. Resolves to the schedule id. |
| `ctx.schedule.cancel(id)` | Deletes a schedule. |
| `ctx.cancel(jobId)` | Cancels a job. |
| `ctx.problem(code, params?)` | Makes a `ProblemError` to throw. `code` is `<namespace>/UPPER_SNAKE`; it is never retried. |

Calls to other extensions are typed when the other extension augments the SDK's `Commands` and `Queries` interfaces in its package: add `import type {} from '@kvman/kvai'` (the other extension must be a `kvman.dependencies` entry and a devDependency). A name that isn't declared takes and returns `unknown`.

Not everything has to be a job. A function you call inside a handler runs on that handler's worker with no job at all, which is how an agent of your own runs its tools: see [agents-and-tools.md](agents-and-tools.md).

## The current job

`ctx.job` exists only while a handler runs; outside one it fails `NO_JOB`.

| Field | Is |
|---|---|
| `id` | The job id (a UUIDv7). |
| `rootId` | The id of the first job of this sync chain. |
| `workspace` | `{ id, name, path }`. |
| `caller` | `{ kind: 'user' }`, `{ kind: 'extension', name }`, or `{ kind: 'kernel' }`. |
| `signal` | An `AbortSignal`, aborted on cancel, timeout, or shutdown. |
| `progress(data)` | Sends a progress chunk (JSON, at most 64 KiB) to the job's stream ([http-api.md](http-api.md)). |

## Storage, files, settings, secrets

Every call returns a Promise. Details and limits are in [storage.md](storage.md).

| API | Calls |
|---|---|
| `ctx.store`, `ctx.store.global` | `kv.get/set/delete(key)`; `collection(name, schema)` with `insert`, `get`, `find(filter, { limit, order? })`, `count`, `update`, `delete`; `transaction((tx) => …)` |
| `ctx.files` | `write(name, data, type)`, `get(id)`, `read(id)`, `path(id)`, `unlink(id)` |
| `ctx.settings` | `get(key)`, `set(key, value, { scope })` (your own keys only) |
| `ctx.secrets` | `get(name)`, `set(name, value)`, `delete(name)` |

## Processes

For long-lived child processes (a server, a watcher): `ctx.processes.start(name, { command, args?, cwd?, env? })`, `stop(name)`, `list()`, and `log(name, { tail? })`. A name is lowercase kebab case and unique per extension and workspace; starting a running one fails `PROCESS_RUNNING`. Short-lived processes stay plain `node:child_process` inside the job. See [jobs.md](jobs.md).

## Handlers

`ctx.registerHandler(point, { description, handle, retries?, timeoutMs? })` registers a handler for one of the kernel's points: `kernel.job.failed`, `kernel.job.succeeded`, `kernel.job.cancelled`, `kernel.process.exited`, `kernel.workspace.opened`, `kernel.started`, and `kernel.stopping`. Each handler runs as an ordinary async job whose caller is the kernel. See [jobs.md](jobs.md).

## Logging

`ctx.log.debug/info/warn/error(message, fields?)` writes a line to `logs/kvman.log`, tagged with the extension and the job id. `message` and `fields` must never carry payloads, setting values, or secrets. `ctx.log` also works outside a job, for example in the entry.

## Web types

`@kvman/sdk/web` exports the types of the `kvman` object kvwebui injects into custom components, and of view trees. It is types only ([components.md](components.md)).

## Next

- [jobs.md](jobs.md)
- [storage.md](storage.md)
- [views.md](views.md)
