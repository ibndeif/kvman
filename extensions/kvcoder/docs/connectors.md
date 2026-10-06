# Connectors

A **connector** is a named set of commands the agent runs with its one tool, `run`:

```json
{ "description": "Adding milk to the notes", "connector": "notes", "command": "add", "payload": { "text": "Buy milk" } }
```

- `description` is one sentence for the person, shown on the call's card.
- `connector` and `command` name what runs; `payload` is the command's input, and may be left out when it takes none.
- Every connector has the command `help`: with no payload it describes the connector and its commands, and with `{ "command": "add" }` it gives that command's payload and result as JSON Schema, with its examples.

A connector is the only way the agent reaches anything outside the model. An extension registers its connectors with kvcoder, which keeps them in its own store for one run: see **Lifetime** below.

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
      { name: 'clear', command: 'notes.note.clear', asks: true },
    ],
  }),
});
```

- The registering extension declares `@kvman/kvcoder` in `kvman.dependencies`, so its `kernel.started` handler runs after kvcoder's clear.
- `kvcoder.connector.register` takes exactly one of `commands` or `binary`, plus `name` and `description`.
- To register several connectors in one call, pass `{ connectors: [ … ] }`, each entry shaped as one connector. All are checked first and stored together: the call registers all of them or none, and a name given twice fails `VALIDATION_FAILED`.
- `name`: the `connector` the agent names. Names, and each command's `name`, are lowercase kebab-case single words: `model-list`, not `model list`. A command can't be named `help`.
- `description`: what the agent sees in the prompt's connector index. Say what the connector is for and when to use it. kvcoder adds the command names after it (`Commands: add, list, help.`), so the index is never out of date. The prompt lists the payloads of kvcoder's own connectors (`shell`, `fs`, `artifact`, `background`, `ask`, `delegate`); the agent learns a registered connector's payloads from `help`, so clear field names and descriptions matter.
- `commands`: each command's `name`, the public `command` it runs, and optional `examples` (`{ description, input }`). `help` shows the registered descriptions, JSON Schemas, and examples, so give every input field a `.describe()`.
- `asks: true` on a command makes the person approve every call of it first (see **A command that asks** below). The field takes only `true`; leave it out for a command that runs at once.
- Each `command` must be a public command or query of the registering extension, or registration fails `VALIDATION_FAILED`. The command runs through `ctx.exec` with the payload as its input, so validation, cancel, and timeouts are the kernel's, and it runs to its end inside the agent's step.
- The result the agent reads is the output as indented JSON, or `error <code>: <message>`. A payload that doesn't fit returns each problem and then the payload's signature, such as `{ text, done? }`, so the agent can correct it in one try; a payload that isn't a plain object returns its JSON Schema on one line instead.
- `binary`: a program on the system, with `{ check, install?, help? }`. `check` is a line whose exit code 0 means the program is usable; the connector is listed, and can be called, only while its check passes.

## A command that asks

Mark a command with `asks: true` when it changes something the person didn't make in this chat: their settings, their data, what is installed.

- Every call of it becomes an approval card in the chat, showing the call's `description`, the connector and command, and the payload. The turn waits for the answer.
- It asks whatever `kvcoder.shell.approval` says. That setting covers kvcoder's own `shell`, `fs`, and `mcp` calls, which carry `risky`; a registered command has no `risky`, so the flag on its entry decides.
- **Allow** runs the command at the start of the next step, and its result goes to the agent as usual. **Deny** returns `denied by the user`, and the command never runs.
- The payload isn't checked before the person is asked; the kernel validates it when the command runs.
- `help { "command": "clear" }` adds the line "The person is asked before this runs.", so the agent knows. `help` itself never asks.
- A subagent's call asks the same way; its card shows in the chat that started it.
- `asks` belongs to a command entry: on a binary connector it fails `VALIDATION_FAILED`, and so does `asks: false`.
- `kvcoder.connector.list` answers `asks` (`true` or `false`) for each command.
- `runConnector` from `@kvman/kvcoder/testing` runs the command at once: a test has no person to ask.

A binary connector names a program instead of commands:

```ts
await ctx.exec('kvcoder.connector.register', {
  name: 'gh',
  description: 'GitHub CLI.',
  binary: { check: 'gh --version', install: 'https://cli.github.com' },
});
```

The agent calls a binary connector with two commands. `exec { args?, background?, timeoutMs?, risky }` runs the program with those arguments in the real shell, in the workspace folder. `help {}` describes `exec` and prints the program's own help (`gh --help`), and `help { "command": "pr" }` prints `gh pr --help`. For a program whose help is asked another way, register the line with `{command}` standing for the command: `help: 'go help {command}'`.

`kvcoder.connector.unregister { name }` removes one of the caller's own connectors; a missing name does nothing. `kvcoder.connector.list` answers every registered connector and program, each with `enabled`. The setting `kvcoder.connectors.disabled` lists the names that are turned off, kvcoder's own seven included: such a connector is left out of the prompt and can't be called, from the next step.

## A connector that is off until enabled

Register a connector with `optIn: true`, the only value the field takes, when it belongs only in chats that asked for it.

- It is in no chat's connector index and no `run` enum, and a call to it gets the answer for a connector that doesn't exist.
- Its owner switches it on for one chat: `kvcoder.connector.enable { sessionId, names }`. Each name must be an `optIn` connector of the caller (`VALIDATION_FAILED`); an unknown session fails `kvcoder/SESSION_NOT_FOUND`, and a subagent's `VALIDATION_FAILED`.
- The chat keeps it across restarts. A subagent has it only when its chat enabled it and its worker lists it. A fork starts with none. Nothing switches one off again, and `kvcoder.connectors.disabled` still turns it off.
- `kvcoder.connector.list` rows have `optIn`.

## Slash commands

`kvcoder.slash.register { commands: [{ name, description, command, message? }] }` adds commands to the send box, after kvcoder's own six.

- `name`: lowercase kebab case; kvcoder's own names and another extension's fail `kvcoder/NAME_TAKEN`, and a name given twice `VALIDATION_FAILED`. All of a call's commands are stored, or none.
- `description` and `message`: translation keys of the caller's catalog.
- `command`: a public command of the caller (`VALIDATION_FAILED` otherwise). The send box calls it with `{ sessionId, argument }`, where `argument` is the text after the name, `''` when there is none.
- With `message`, a command that succeeded is followed by the person's message: the argument, or with none the text of `message`. A command that failed shows its Problem and sends nothing.
- `kvcoder.slash.unregister { name }` removes the caller's own; `kvcoder.slash.list` answers `[{ name, description, command, message?, owner }]`, by name.
- With no chat open yet, the list is greyed and nothing runs.

## Built-in connectors

kvcoder's own connectors are `shell` (one line in the real shell), `fs` (read, list, search, write, and edit files in the workspace folder), `artifact` (a document shown beside the chat), `background` (follow up on what was started with `background: true`), `ask` (a question that suspends the turn), `delegate` (`delegate run { worker, task, background? }` hands a task to a worker, which runs it in a helper session; the workers are the setting `kvcoder.delegate.workers`, and it is a connector of a session only while a worker is turned on), and `mcp` (the tools of the MCP servers the person added; it is a connector of a session only while the workspace has a server). Their names are taken: registering one fails `kvcoder/NAME_TAKEN`.

`shell exec`, a binary's `exec`, `fs write`, `fs edit`, and `mcp call` ask the person first when the payload says `risky: true`, or always when `kvcoder.shell.approval` is `ask`. A registered command asks only when its entry has `asks: true`, and then always. `risky` is required: a call that leaves it out fails `VALIDATION_FAILED` and asks nobody. Only `shell exec`, a binary's `exec`, and `delegate run` take `background: true`; every other command runs to its end.

## Ownership

- The caller owns what it registers; only the owner replaces or removes it.
- A connector name owned by another extension fails `kvcoder/NAME_TAKEN` (`{ name, owner }` in the problem's params).

## Lifetime

- Connectors and slash commands last one run. kvcoder clears them in its own `kernel.started` handler, which runs first because registering extensions declare kvcoder as a dependency. Each extension registers its connectors and slash commands again from its own `kernel.started` handler. A hot reload of kvcoder reruns its dependents' handlers too.
- Sections are stored until removed; see [Sections](sections.md).
- When kvcoder reads, it ignores any connector whose owner isn't loaded.
