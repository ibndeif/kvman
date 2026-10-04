# Connectors

A **connector** is a word the agent can type in its shell. An extension registers its connectors with kvcoder, and the agent uses them instead of the shell whenever one covers the task. kvcoder keeps them in its own store, for one run: see **Ownership and lifetime** below.

Register from the registering extension's `kernel.started` handler, every start:

```ts
ctx.registerHandler('kernel.started', {
  description: 'Registers the notes connector with kvcoder.',
  handle: () => ctx.exec('kvcoder.connector.register', {
    name: 'notes',
    description: 'Add and list notes.',
    commands: [
      { name: 'add', command: 'notes.note.add', examples: [{ description: 'Add a note', input: { text: 'Buy milk' } }] },
      { name: 'list', command: 'notes.note.list' },
    ],
  }),
});
```

- The registering extension declares `@kvman/kvcoder` in `kvman.dependencies`, so its `kernel.started` handler runs after kvcoder's clear.
- `kvcoder.connector.register` takes exactly one of `commands` or `binary`, plus `name` and `description`.
- `name`: the word the agent types. `notes add '{"text":"Buy milk"}'` runs `notes.note.add`. JSON may also come on stdin (a heredoc, or a PowerShell here-string); with no JSON the input is `{}`.
- `description`: what the agent sees in the prompt's connector index. Say what the connector is for and when to use it.
- `commands`: each command's `name`, the public `command` it runs, and optional `examples` (`{ description, input }`). `notes -h` and `notes add -h` print descriptions, JSON Schemas, and examples, so give every input field a `.describe()`.
- Each `command` must be a public command or query of the registering extension, or registration fails `VALIDATION_FAILED`. A query can't run with `--async`. Connector calls stand alone: the command runs through `ctx.exec`, so validation, cancel, and timeouts are the kernel's. The result the agent reads is the output as JSON text, or `error <code>: <message>` with exit code 1.
- `--async` queues the call as kvcoder's own job; its result arrives later as a message.
- `binary`: a program on the system, run by the agent in the real shell, with `{ check, install? }`. `check` is a command whose exit code 0 means the program is usable; the connector is listed in the prompt only while its check passes.

A binary connector names a program instead of commands:

```ts
await ctx.exec('kvcoder.connector.register', {
  name: 'gh',
  description: 'GitHub CLI.',
  binary: { check: 'gh --version', install: 'https://cli.github.com' },
});
```

`kvcoder.connector.unregister { name }` removes one of the caller's own connectors; a missing name does nothing. `kvcoder.connector.list` answers every connector the agent may use.

## Built-in connectors

kvcoder ships two built-ins: `ask` (a question or approval that suspends the turn) and `subagent` (a background helper session). Their names are taken: registering a connector named `ask` or `subagent` fails like any other taken name.

## Ownership

- The caller owns what it registers; only the owner replaces or removes it.
- A connector name owned by another extension fails `kvcoder/NAME_TAKEN` (`{ name, owner }` in the problem's params).

## Lifetime

- Connectors last one run. kvcoder clears them in its own `kernel.started` handler, which runs first because registering extensions declare kvcoder as a dependency. Each extension registers its connectors again from its own `kernel.started` handler. A hot reload of kvcoder reruns its dependents' handlers too.
- Sections are stored until removed; see [Sections](sections.md).
- When kvcoder reads, it ignores any connector whose owner isn't loaded.
