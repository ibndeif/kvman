# Extending kvcoder: connectors, sections, and the pull convention

This page is for anyone whose extension should be usable by kvman's agent, or who wants to offer extension points of their own. When you finish, you can register a connector so the agent can call your commands, add text to the agent's prompt, react to kvcoder's events, and decide between letting others push to you and pulling from them.

`kvman-docs get @kvman/kvcoder connectors` and `... sections` print the shorter reference kvcoder serves itself.

## Connectors

A **connector** is a word the agent types in its shell tool, followed by a call and a JSON input. Register one from your `kernel.started` handler, every start:

```ts
ctx.registerHandler('kernel.started', {
  description: 'Registers the notes connector with kvcoder.',
  handle: () => ctx.exec('kvcoder.connector.register', {
    name: 'notes',
    description: 'Add and list notes. Use it for any work on the person\'s notes.',
    commands: [
      { name: 'add', command: 'notes.note.add', examples: [{ description: 'Add a note', input: { text: 'Buy milk' } }] },
      { name: 'list', command: 'notes.note.list' },
    ],
  }),
});
```

- Declare `@kvman/kvcoder` in `kvman.dependencies`, so your `kernel.started` handler runs after kvcoder clears the registry.
- `name` is the word the agent types (`notes add '{"text":"Buy milk"}'` runs `notes.note.add`). Names, and each call's `name`, are lowercase kebab-case **single words**: `model-list`, not `model list`.
- `description` is what the agent sees in the prompt's connector index. Say what it is for and when to use it.
- Each call's `command` must be a public command or query of **your own** extension, or registration fails `VALIDATION_FAILED`. A query can't run with `--async`. The result the agent reads is the output as JSON text, or `error <code>: <message>` with exit code 1.
- `notes -h` and `notes add -h` print descriptions, JSON Schemas, and examples, so give every input field a `.describe()`.
- A connector with `binary: { check, install? }` instead of `commands` names a program on the system (`gh`); it is listed in the prompt only while its `check` command exits 0.
- `ask` and `subagent` (and `fs`, `artifact`, `jobs`) are built in; their names are taken.

`kvcoder.connector.unregister { name }` removes one of your own; `kvcoder.connector.list` answers every connector the agent may use. A name owned by another extension fails `kvcoder/NAME_TAKEN`. Connectors last one run: kvcoder clears them at its own start, and each owner registers again.

## Sections

A **section** is text added to the agent's system prompt. Set one with `kvcoder.section.set { id, title, order, content, global?, sessionId? }`: `global: true` reaches every workspace's prompts, `sessionId` one session's, neither the calling job's workspace. A section is at most 16 KB, and all sections a prompt could reach are at most 64 KB together (`TOO_LARGE`). Sections are stored until removed (`kvcoder.section.remove`). See `kvman-docs get @kvman/kvcoder sections`.

## Events

kvcoder offers fixed points others register handlers for: `kvcoder.session.created`, `.deleted`, `.forked`, `kvcoder.turn.started`, `.ended`, and `kvcoder.session.waiting`. Register with `kvcoder.handler.register { point, command }` (your own public command; one handler per point per extension, cleared at each start). The inputs carry ids and totals, never message contents.

## Offering your own extension points

There are two shapes, and the choice matters for who depends on whom.

**Push (register with an owner).** The owner exposes public commands; contributors call them from their `kernel.started` handler and the owner stores entries keyed by the caller. kvcoder's connectors work this way. Contributors **depend on the owner**, so the owner loads first and clears the registry, and the owner needs a store and a rule for stale entries.

**Pull (the owner asks).** The owner calls a public query named under each contributor's own namespace and needs no registration, no load order, and no dependency in either direction. kvwebui pulls `<namespace>.ui.get`; kvcustomizer pulls `<namespace>.docs.list` and `<namespace>.docs.get` ([documenting-your-extension.md](documenting-your-extension.md)).

Prefer pull when the owner is optional, or when contributors shouldn't need the owner installed, which is why the core extensions document themselves by pull. Use push when the owner must keep state about its contributors.

## Testing a connector

`runConnector(kernel, 'notes add \'{…}\'')` from `@kvman/kvcoder/testing`, used with `createTestKernel`, parses a line exactly as kvcoder does and returns `{ output, exitCode }`, including for `-h`. It runs connector lines only and never starts a shell.

## Next

- [documenting-your-extension.md](documenting-your-extension.md)
- [testing.md](testing.md)
- [sdk.md](sdk.md)
