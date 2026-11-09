# QA 81 — A background line wakes its chat by default (ADR 0125)

**Asked.** The owner reported that kvman didn't go on when background jobs ended. In the two latest chats the agent
started 25 background lines and set `notify` on none, so no end woke the chat and the owner typed "Continue." three
times. The owner chose `notify` true by default, `notify: false` for a server.

Paths are relative to the repository root.

## Happy path

- **QA81-H1 a background line wakes the idle chat by default.** *Given* `shell exec` with `background: true` and no
  `notify`, *when* the turn ends and the line then exits by itself, *then* its message starts a turn, whose request
  holds the message (ADR 0125, 1). — `extensions/kvcoder/test/background-notify-default.test.ts`
- **QA81-H2 the model is told.** *Given* the agent calls `shell help { command: 'exec' }`, *then* `notify`'s
  description says it is true by default with background and to set it to false for a server; the shell connector's
  line and the working method say a background line that ends wakes the chat (ADR 0125, 2). —
  `extensions/kvcoder/test/background-notify-default.test.ts`, with the prompt texts in
  `extensions/kvcoder/test/prompt.test.ts` and `extensions/kvcoder/test/background-aware.test.ts`

## Edge cases

- **QA81-E1 `notify: false` keeps a line quiet.** *Given* `background: true, notify: false`, *when* the line exits by
  itself while the chat is idle, *then* its message is appended and no turn starts (ADR 0125, 1; replaces the second
  half of QA71-H29). — `extensions/kvcoder/test/background-notify-default.test.ts`
- **QA81-E2 a restart keeps the setting.** *Given* a running background line started with no `notify`, *when* the
  person restarts it and the new process exits by itself, *then* a turn starts; *given* one started with
  `notify: false`, the new process's end starts none (ADR 0125, 3). —
  `extensions/kvcoder/test/background-notify-default.test.ts`
- **QA81-E3 the person's Stop wakes nothing.** *Given* a running background line started with no `notify`, *when* the
  person stops it with `kvcoder.job.cancel`, *then* its "stopped by the person" message is appended and no turn starts
  (ADR 0125, 4). — `extensions/kvcoder/test/background-notify-default.test.ts`

Unchanged and still covered: `notify: true` without `background` fails `VALIDATION_FAILED` (QA71-E25), and an end
while a turn runs is read by its next step with no second turn (QA71-E26).

The older tests whose background lines are servers, or whose quiet end they check, now set `notify: false` on those
lines, as ADR 0125, 1 says a server does; with the default, each such line's watcher would keep a job running.
