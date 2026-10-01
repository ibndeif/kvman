# Connectors and sections (kvcoder)

kvcoder's agent has one tool, a shell. A **connector** is a word it can type there. An extension registers its connectors from its `kernel.started` handler, every start, and declares `@kvman/kvcoder` in `kvman.dependencies`.

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

- The agent then runs `notes add '{"text":"Buy milk"}'`; the JSON may also come on stdin (a heredoc, or a PowerShell here-string). With no JSON, the input is `{}`.
- Each `command` must be a public command or query of the registering extension. `notes -h` and `notes add -h` print descriptions, JSON Schemas, and examples, so give every input field a `.describe()`.
- `--async` queues the call; its result arrives later as a message.
- The result the agent reads is the output as JSON text, or `error <code>: <message>` with exit code 1.
- A binary connector names a program on the system instead: `{ name: 'gh', description, binary: { check: 'gh --version', install: '<url>' } }`.
- A connector name owned by another extension fails `kvcoder/NAME_TAKEN`.

## Sections

A section is text in the agent's system prompt. Its owner pushes it whenever its data changes:

```ts
await ctx.exec('kvcoder.section.set', { id: 'open-notes', title: 'Open notes', order: 40, content: text });
```

- `global: true` reaches every workspace's prompts, `sessionId` one session's, and neither the job's workspace.
- A section holds at most 16 KB, and all of them 64 KB together.
- `kvcoder.section.remove { id }` removes the caller's own section.

## Session points

`kvcoder.handler.register { point, command }` has one of your public commands called when a session is created, deleted, or forked, or when a turn starts, ends, or waits; it gets ids and totals, never message contents.
