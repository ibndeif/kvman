# The extension API (`@kvman/sdk`)

An extension is a package whose `package.json` has `main` and a `kvman` field, and lists `@kvman/sdk` as a peerDependency:

```json
{ "name": "notes", "version": "0.1.0", "type": "module", "main": "dist/index.js",
  "peerDependencies": { "@kvman/sdk": "^0.1.0" },
  "kvman": { "namespace": "notes", "source": "src/index.ts", "dependencies": {} } }
```

`src/index.ts` default-exports one function of `ctx`. It only registers; it runs once in every worker.

```ts
import { z, type Ctx } from '@kvman/sdk';

const note = z.object({ text: z.string() });

export default (ctx: Ctx): void => {
  ctx.registerCommand('notes.note.add', {
    description: 'Adds a note to this workspace.',
    public: true,
    input: z.object({ text: z.string().describe('The note.') }),
    output: z.object({ id: z.string() }),
    handle: async (input) => ({ id: (await ctx.store.collection('notes', note).insert({ text: input.text })).id }),
  });
  ctx.registerQuery('notes.note.list', {
    description: 'Lists the notes of this workspace.',
    public: true,
    input: z.object({ limit: z.number().int().max(1000).describe('How many to list.') }),
    output: z.array(z.object({ id: z.string(), text: z.string() })),
    handle: (input) => ctx.store.collection('notes', note).find({}, { limit: input.limit }),
  });
  ctx.registerSetting('notes.greeting', { description: 'The greeting shown above notes.', schema: z.string(), default: 'Hello' });
};
```

## Rules the kernel enforces at load

- Every name starts with `<namespace>.`, in lowercase kebab-case segments. A command ends in an imperative verb (`add`, `run`); a query ends in a read verb (`get`, `list`, `search`, `count`).
- Every registration has a one-sentence `description`. A name registered twice, or an invalid registration, stops the load with `EXTENSION_INVALID`.
- Use the SDK's `z` for every schema: inputs, outputs, and settings are validated at runtime.
- Registrations are private unless `public: true`. Forms, HTTP, connectors, and other extensions need `public: true`.
- Error codes of an extension are `<namespace>/UPPER_SNAKE`: `throw ctx.problem('notes/NOT_FOUND', { id })`.

## Jobs

- `ctx.exec(name, input)` runs a command or query now; `ctx.execAsync(name, input)` queues a command (it survives restarts and retries); `ctx.schedule(name, input, { at } | { cron })` runs one later.
- Commands may write; queries are read-only. Commands take `retries` (default 3) and `timeoutMs` (default 600 000).
- Inside a handler, `ctx.job` holds `{ id, rootId, workspace: { id, name, path }, caller, signal, progress(data) }`.
- A handler's work ends when it returns: no `setInterval`, unawaited `setTimeout`, or promise left running. Long work goes to `execAsync` or `ctx.schedule`; long-lived child processes to `ctx.processes`.
- Handlers keep no state in memory between jobs; anything that lasts goes in the store.

## Storage, settings, secrets

- `ctx.store.kv` and `ctx.store.collection(name, schema)` are per workspace; `ctx.store.global` is shared by every workspace. Every call returns a Promise; `ctx.store.transaction((tx) => …)` is synchronous.
- `ctx.settings.get(key)` reads any key; an extension sets only its own keys.
- `ctx.secrets.get/set/delete(name)` keep secrets in `secrets.json` only. Never log, store, or return a secret.
- `ctx.log.info(message, fields)` writes to the kvman log; never log payloads, settings values, or secrets.

## Handler points

`ctx.registerHandler(point, { description, handle })` runs a handler when the kernel reaches a point: `kernel.started`, `kernel.stopping`, `kernel.workspace.opened`, `kernel.job.failed`, `kernel.job.succeeded`, `kernel.job.cancelled`, or `kernel.process.exited`. There are no events or listeners beyond these.

## Typing calls to other extensions

An extension augments `Commands` and `Queries` of `@kvman/sdk` for its public names. A caller gets typed `ctx.exec` after `import type {} from '<that extension>'`, allowed only when it is a `kvman.dependencies` entry.

## Testing

`npm test` runs `node --test` with `@kvman/testkit`:

```ts
const kernel = await createTestKernel({ extensions: ['./'], settings: { 'notes.greeting': 'Hi' } });
await kernel.exec('notes.note.add', { text: 'hi' });                         // as the user
await kernel.exec('notes.note.add', { text: 'hi' }, { as: '@acme/other' });  // as an extension
await kernel.close();
```
