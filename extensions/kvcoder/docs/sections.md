# Sections

A **section** is text in the agent's system prompt. Its owner pushes it whenever its data changes; kvcoder adds it to the prompts its reach allows.

```ts
ctx.registerHandler('kernel.started', {
  description: 'Publishes a global section with kvcoder.',
  handle: () => ctx.exec('kvcoder.section.set', { id: 'open-notes', title: 'Open notes', order: 40, global: true, content: 'Current work: …' }),
});
```

`kvcoder.section.set` takes:

- `id`: the section's name within its owner. Ids belong to their owner: two extensions may both have an `open-notes` section, and each call touches only the caller's.
- `title`: a short human-readable label.
- `order`: sections are added to a prompt in ascending `order`.
- `content`: the text, at most 16 KB (16 × 1024 bytes).
- One of: `global: true`, `sessionId`, or neither. `global: true` reaches every workspace's prompts; `sessionId` reaches that session's prompts only; neither reaches every prompt of the calling job's workspace. `global` and `sessionId` exclude each other.

`kvcoder.section.remove { id }` (with the same `global`/`sessionId` place) removes the caller's own section; a missing one does nothing. `kvcoder.section.list` answers the sections a session's prompt reaches, `[{ id, title, order, owner, global, sessionId?, size }]`.

## Caps and errors

- A section holds at most 16 KB, and all sections a prompt could reach hold at most 64 KB together. `kvcoder.section.set` fails `TOO_LARGE` when the section alone, or the global sections plus the job's workspace ones plus the session's, would pass the limits.
- If a built-up prompt still finds more, the last sections by `order` are left out and a warning is logged.
- Sections are stored until removed: they survive restarts, and `section.set` again replaces the caller's section with the same `id` and place.
- Stale owners are ignored: sections whose registering extension isn't loaded are left out of prompts.
