# Extending kvcoder: connectors, sections, and the pull convention

This page is for anyone whose extension should be usable by kvman's agent, or who wants to offer extension points of their own. When you finish, you can register a connector so the agent can run your commands with its `run` tool, add text to the agent's prompt, react to kvcoder's events, and decide between letting others push to you and pulling from them.

`kvman-docs get @kvman/kvcoder connectors` and `... sections` print the shorter reference kvcoder serves itself.

## Connectors

kvman's agent has one tool, `run`, and a **connector** is a named set of commands it runs with it. A connector is the only way the agent reaches anything outside the model: the shell and files are kvcoder's own connectors, and your extension adds its own.

```json
{ "description": "Adding milk to the notes", "connector": "notes", "command": "add", "payload": { "text": "Buy milk" } }
```

`description` is one sentence for the person. `payload` is your command's input. Register a connector from your `kernel.started` handler, every start:

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
- `name` is the `connector` the agent names, and each command's `name` its `command`. Both are lowercase kebab-case **single words**: `model-list`, not `model list`. A command can't be named `help`.
- `description` is what the agent sees in the prompt's connector index. Say what it is for and when to use it. kvcoder adds the command names after it, so you never list them yourself.
- Each command's `command` must be a public command or query of **your own** extension, or registration fails `VALIDATION_FAILED`. kvcoder runs it with `ctx.exec`, with the payload as its input, on a worker like any job, and it runs to its end inside the agent's step.
- The result the agent reads is your output as indented JSON, or `error <code>: <message>`. A payload that doesn't fit your input schema returns the problems and the schema itself.
- Every connector has `help`, built from what you registered: `help` with no payload lists your commands with their descriptions, and `help { "command": "add" }` gives that command's payload and result as JSON Schema, with your examples. Give every input field a `.describe()`, since the agent learns the payload from it.
- A connector with `binary: { check, install?, help? }` instead of `commands` names a program on the system (`gh`). It is listed only while its `check` line exits 0, and the agent calls it with `exec { args }` and `help`. `help` runs `<name> --help`, or the line you give with `{command}` in it (`go help {command}`).
- `shell`, `fs`, `artifact`, `background`, `ask`, and `subagent` are built in; their names are taken.
- To register several connectors, pass them together: `ctx.exec('kvcoder.connector.register', { connectors: [notesConnector, tagsConnector] })`. They are checked first and stored together, so either all are registered or none is, and it is faster at start than one call each. Keep each connector in its own file, exporting the object you register.

## What the agent can't do

The agent never sees a kernel job or the process service. A command of yours can't be queued by the agent: if it starts long work, return at once and do the work with `ctx.execAsync` or `ctx.processes` inside your own extension, and offer a second command that reports on it. Only the built-in `shell exec`, a binary's `exec`, and `subagent run` take `background: true`, and the agent follows those up with the `background` connector.

A tool that is a plain function, for an agent that your own extension runs, needs no connector at all: see [agents-and-tools.md](agents-and-tools.md).

`kvcoder.connector.unregister { name }` removes one of your own; `kvcoder.connector.list` answers every registered connector and program, each with `enabled`: the person turns a connector off on Coder's page under Extensions (the setting `kvcoder.connectors.disabled`, a list of names, which a preset may set too), and one that is off is left out of the prompt and can't be called. A name owned by another extension fails `kvcoder/NAME_TAKEN`. Connectors last one run: kvcoder clears them at its own start, and each owner registers again.

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

`runConnector(kernel, { connector: 'notes', command: 'add', payload: { text: 'Buy milk' } })` from `@kvman/kvcoder/testing`, used with `createTestKernel`, runs a call exactly as kvcoder does and returns `{ output, exitCode }`, including for `help`. It runs your connector's commands only and never starts a shell.

## Next

- [agents-and-tools.md](agents-and-tools.md)
- [documenting-your-extension.md](documenting-your-extension.md)
- [testing.md](testing.md)
- [sdk.md](sdk.md)
