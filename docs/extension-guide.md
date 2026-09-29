# The kvman extension guide

Everything in kvman is an extension, the AI agent included. This guide takes you from nothing to a tested extension, then walks through the parts of the API you use most. The API reference of `@kvman/sdk` is generated into `docs/api/` by `pnpm build`. The one-page naming cheat sheet is [`naming.md`](naming.md).

Every code block below is quoted from a project under `examples/`, whose tests run in the repository's gates in both isolation modes. The first line of each block names the file it comes from.

## Your first extension in 10 minutes

1. **Create the project.** `kvman ext new hello` writes a project with `package.json`, `src/extension.ts`, a test, and catalogs in `en` and `ar`.
2. **Run it in your kvman.** `kvman ext dev ./hello --watch` stages the folder as a dev version in the current workspace. Every save reloads it.
3. **Edit a command and see it.** Change the greeting in `src/extension.ts`; the shell shows the new text on its next call, without a restart.
4. **Test it.** `npm test` runs the tests against the real kernel with `@kvman/testkit` (below).
5. **Publish it.** `npm publish` puts it on npm; anyone installs it with `kvman ext install @you/hello`, after the grant dialog shows what it asks for.

The CLI arrives with M2.14 and the shell with M3; until then, start from `examples/hello` and run its test from the repository root with `pnpm vitest run examples/hello`.

### What `hello` looks like

An extension is `defineExtension(meta, setup)`. `setup` only registers: it runs at install to record the manifest, and again in the host to bind your functions. Keep it to `ext` calls and constants.

```ts
// examples/hello/src/extension.ts
export default defineExtension({
  name: '@kvman/example-hello',
  namespace: 'hello',
  title: '$t.title',
  description: 'Greets people by name and counts the greetings.',
}, (ext) => {
```

A command does something and returns its result. Its input and output are Zod schemas, checked by the kernel at the boundary. Its handler acts only through `ctx`: here the key-value store, which commits with the reply or not at all, and `ctx.i18n.t`, which formats a message of your catalog in the language of the person who started the chain.

```ts
// examples/hello/src/extension.ts
  ext.registerCommand('hello.greet', {
    description: 'Greets a person by name in their language and counts the greeting.',
    input: z.object({ name: z.string().min(1).max(100) }),
    output: z.object({ greeting: z.string() }),
    async handle(input, ctx) {
      const count = (await ctx.store.kv.get<number>('count')) ?? 0;
      ctx.store.kv.set('count', count + 1);
      return { greeting: ctx.i18n.t('greeting', { name: input.name }) };
    },
  });
```

A query only reads. It is never queued and never stored.

```ts
// examples/hello/src/extension.ts
  ext.registerQuery('hello.greetings.count', {
    description: 'Counts the greetings so far in this workspace.',
    input: z.object({}),
    output: z.object({ count: z.number().int().nonnegative() }),
    async handle(_input, ctx) {
      return { count: (await ctx.store.kv.get<number>('count')) ?? 0 };
    },
  });
```

Text for people is always a key of your catalogs. Ship `en` and `ar`; the testkit fails a test when a key you use is missing from any catalog you ship.

```ts
// examples/hello/src/extension.ts
  ext.registerTranslations({
    default: 'en',
    catalogs: {
      en: { title: 'Hello', greeting: 'Hello, {name}!' },
      ar: { title: 'مرحبا', greeting: 'مرحبا يا {name}!' },
    },
  });
```

### Testing `hello`

`createTestKernel` runs the real kernel on a temporary home folder and installs your extension from its entry module. `k.asUser()` sends as the person; with `locale`, the person's language is switched first, exactly as the shell's language switch does.

```ts
// examples/hello/test/hello.test.ts
beforeEach(async () => {
  k = await createTestKernel({ extensions: [new URL('../src/extension.ts', import.meta.url)] });
});

afterEach(async () => {
  await k.close();
});
```

```ts
// examples/hello/test/hello.test.ts
    expect(await k.asUser().command('hello.greet', { name: 'Sara' })).toEqual({ greeting: 'Hello, Sara!' });
    expect(await k.asUser().command('hello.greet', { name: 'Sara' })).toEqual({ greeting: 'Hello, Sara!' });
    expect(await k.asUser({ locale: 'ar' }).command('hello.greet', { name: 'Sara' })).toEqual({ greeting: 'مرحبا يا Sara!' });
    expect(await k.query('hello.greetings.count')).toEqual({ count: 3 });
```

## Asking a person: the prompt pattern

kvman has no prompt primitive: an extension that needs an answer stores the question, shows it in its own UI, and waits for a command only a person may send. `ext.registerPrompt` registers all of those pieces in one call. `examples/confirm` asks the person to approve an action:

```ts
// examples/confirm/src/extension.ts
  // Registers the collection `requests`, the query `confirm.requests.list`, the commands `confirm.request.answer`
  // and `confirm.request.reject` (people only) and `confirm.request.expire`, and the events `confirm.request.asked`
  // and `confirm.request.closed`.
  const requests = ext.registerPrompt('confirm.request', {
    description: 'An action waiting for the person to approve or refuse it.',
    data: z.object({ topic: z.string().min(1), question: z.string().min(1) }),
    answer: z.object({ approved: z.boolean() }),
    oneOpenPer: (request) => `topic:${request.topic}`,
  });
```

The command that asks returns `open(...)`: the prompt is stored, `confirm.request.asked` is published, and the command's reply is deferred until the person answers, rejects, or the command's deadline passes. It does not hold its lane while it waits.

```ts
// examples/confirm/src/extension.ts
  ext.registerCommand('confirm.ask', {
    description: 'Asks the person to approve an action and replies with their answer.',
    input: z.object({ topic: z.string().min(1), question: z.string().min(1) }),
    output: z.union([z.object({ approved: z.boolean() }), z.object({ rejected: z.literal(true) })]),
    handle: async (input, ctx) => requests.open(ctx, input),
  });
```

What `registerPrompt` derives from the name `<namespace>.<noun>`:

| Piece | Name | Who may send it |
|---|---|---|
| collection (private) | `<noun>s` | — |
| query | `<namespace>.<noun>s.list { status?, limit?, …data fields }` | anyone |
| command | `<namespace>.<noun>.answer { <noun>Id, …answer }` | people only |
| command | `<namespace>.<noun>.reject { <noun>Id }` → replies `{ rejected: true }` | people only |
| command | `<namespace>.<noun>.expire` (the deferred command's `onAbort`) | the kernel |
| events | `<namespace>.<noun>.asked { <noun>Id }`, `.closed { <noun>Id, status }` | — |
| error | `<namespace>/BUSY`, when `oneOpenPer` finds an open prompt | — |

The first answer wins: a second one fails `REPLY_NOT_AWAITING`. To act when a prompt closes (dismiss a notification, send a review), subscribe to your own `closed` event.

The test proves that only a person can answer. The testkit's `k.command` sends as its own driver extension, which the kernel refuses, while `k.asUser()` answers:

```ts
// examples/confirm/test/confirm.test.ts
    const refused = await k.command('confirm.request.answer', { requestId, approved: true }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(TestkitProblem);
    expect(refused).toMatchObject({ problem: { code: 'CAPABILITY_DENIED' } });

    expect(await k.asUser().command('confirm.request.answer', { requestId, approved: true })).toEqual({});
    expect(await asked).toEqual({ approved: true });
```

## The testkit

| Call | What it does |
|---|---|
| `createTestKernel({ extensions, workspace?, isolation?, processes? })` | starts the real kernel on a temporary home, opens one workspace, installs and enables every extension with all it requests |
| `k.asUser({ locale? }).command(type, payload)` / `.query(...)` | sends as the person; answers the reply's value |
| `k.command(type, payload)` / `k.query(...)` | sends as the testkit's driver extension, whose `calls` cover your extensions |
| `k.events(type?)` | the committed durable and transient events, oldest first |
| `k.ui(type?)` | the admitted `ui.toast`, `ui.notify`, `ui.dismiss`, and `ui.navigate` sends |
| `k.blobs.put(bytes, { mime })` | uploads a blob, as `PUT /blobs` does |
| `k.crashDuring(type, point, payload?)` | stops the kernel abruptly at `before-step:<name>`, `after-step:<name>`, or `before-commit`, restarts it, and answers the reply |
| `k.idle()` | waits until nothing is due or running |
| `fakeProvider({ reply, … })` | a scripted LLM provider, passed in `extensions` |
| `processes: { ffmpeg: { stdout, stderr, exitCode } }` | a spawn of `ffmpeg` runs a scripted stand-in, supervised for real |
| `k.close()` | stops the kernel and deletes its temporary folders |

A problem reply is thrown as a `TestkitProblem`, whose `problem` is what the kernel answered. The testkit also fails a test when:

- a handler throws a code of your namespace that you never registered with `ext.registerError`;
- a key you use is missing from a catalog you ship;
- `setup` records something different on its second run.

Literal text and placeholder descriptions are printed as warnings.

Every test runs twice in the repository's gates: with your extension installed as a builtin (`shared`, a worker thread) and as a local extension (`sandboxed`, its own process under Node's permission model). Choose the mode with `createTestKernel({ isolation })` or `KVMAN_TESTKIT_ISOLATION`.

## Rules for handler code

1. Put all persistent state in `ctx.store`. No module-level state that changes results.
2. Wrap every external side effect in `ctx.step`, or use `ctx.process`.
3. Keep handlers short; for long waits use continuations or deferred replies.
4. Declare a `lane` whenever ordering matters.
5. Register every error you throw (`ext.registerError`), throw it with `ctx.problem(code, { params })`, and mark it `retryable` only when retrying can succeed.
6. Never log payloads or secrets.
7. Keep `setup` to `ext` calls and plain constants.
8. Never build text for people in handlers: send keys with parameters, and use `ctx.i18n.t` only for text that leaves kvman.
