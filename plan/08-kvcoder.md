# 08 — kvcoder (namespace `kvcoder`)

kvcoder is the app-building harness, built on kvai and kvwebui. Its agent has one tool, a shell: `bash` on Linux and macOS, `powershell` on Windows. It reaches everything through that tool. Other extensions extend kvcoder with **connectors** and **sections**. kvcoder owns its conversation UI (§8.7).

## 8.1 Sessions and turns

- **Storage.** Sessions, turns, and messages live in kvcoder's workspace store, so a session exists only in its own workspace, and Home has its own sessions.
- **A session** is `{ id, title, status, parentId?, model, thinking, stepJobId?, usage, durationMs, createdAt, updatedAt }`, plus its binary check results. `stepJobId` is the running step's job, so the UI can reattach to it. Subagents are hidden child sessions with `parentId`.
- **A message:**

  ```
  { id, sessionId, turnId?, seq,        // no seq, and queued: true, while it waits for the step (ADR 0009, 102)
    kind: 'user' | 'assistant' | 'toolResult' | 'notice' | 'note' | 'summary',
    source?: { kind: 'user' } | { kind: 'extension', name } | { kind: 'subagent', sessionId } | { kind: 'job', jobId },
    content,            // a pi-ai message, a notice { code, params }, a note { key, params? }, or a summary { text, coversThroughSeq }
    fileIds?,           // attached images (user messages)
    model?, usage?: { input, output, cacheRead, cacheWrite, cost },
    durationMs?,        // the model call (assistant) or the run time (toolResult)
    createdAt }
  ```
- **A turn** records `{ id, startedAt, endedAt, durationMs, steps, usage, outcome: 'done' | 'cancelled' | 'failed' | 'interrupted' | 'maxSteps' }`. While suspended, it also holds its `pending` calls (`{ toolCallId, kind: 'question' | 'subagent' | 'approval', questionId?, question?, childSessionId? }`, where `question` is the `ask` input with its `kind`, or an approval's `{ title, command, description, mode, timeoutMs }`, ADR 0009, 102, 143, and 149) and the results already produced in that step. When the last pending call resolves, kvcoder appends all results in the model's call order and queues the next step.
- **Totals.** The session keeps running totals of `usage` and `durationMs`, and a subagent's usage adds to its parent's. The conversation shows each turn's time, tokens, and cost under its last answer, and the session's totals in its header.
- **Display-only messages.** A **notice** is kvcoder's own (a cancel, an interruption, a failed summary), shown as `kvcoder.notices.<code>` with its `params`; a `STEP_FAILED` notice's params are `{ code, details }`, the Problem's code and params, and the UI translates them (ADR 0009, 133). A **note** is added by any extension with `kvcoder.note.add` and shown as its translation key with `params`. Neither is sent to the model, and adding a note never starts a turn.
- **Titles.** A title is a string, or `{ key }` for a translated title (the welcome session). Until the first turn ends, the title is the first 60 characters of the first user message. Then kvcoder asks `kvai.complete` (the session's model, no tools, `maxTokens` 30) for a 3–6 word title in the conversation's language. `kvcoder.session.rename` overrides it, and a renamed session is never retitled. A failed title call keeps the placeholder.
- **Welcome.** kvcoder registers a `kernel.workspace.opened` handler (§2.15). When the `kvcoder.welcome` setting isn't `null`, it creates a session titled `{ key: 'kvcoder.welcome.title' }` and adds a note with that setting's key, so a new workspace opens with a greeting in the person's language. A preset sets its own key, or `null` for none.
- **Model.** A session starts with `kvcoder.model` (or `kvai.defaultModel` when that is `null`) and `kvcoder.thinking`. `kvcoder.session.configure` changes either from the next step; an unknown model fails that step (ADR 0009, 107).
- **Long histories.** `kvcoder.message.list` returns the newest `limit` messages, plus `omitted`, the number of older ones. The conversation shows "N earlier messages" and offers the export (its file and shape: ADR 0009, 103).
- **Sending.**
  - `kvcoder.message.send` is for the person only. When the session is idle, it starts a turn and sends the chunk `{ type: 'follow', jobId }` for the first step, so the UI streams the turn. When a turn is running, the message steers it: it waits in the session's queue (`message.list` returns it last, with `queued: true`) and is appended after the step's results, so the next step sees it (ADR 0009, 102).
  - When the session is waiting, a message dismisses the pending questions and denies the pending approvals (the model sees "dismissed by the user" or "denied by the user"), is appended, and the next step runs. When the turn waits only on subagents, the message is queued instead, and the next step runs once they end (ADR 0009, 90).
  - `kvcoder.message.inject` does the same for extensions, and marks the message as coming from that extension.
  - Both take `fileIds?`: kernel files that are images, for a model whose `input` includes `image`. Any other file (images are PNG, JPEG, GIF, or WebP), or an image for a text-only model, fails `VALIDATION_FAILED`; an image deleted later reaches the model as `[image <name> was deleted]` (ADR 0009, 103). Images are read from the files at each step, not copied into the store.
- **Steps.** A turn is a chain of async jobs, one per step (§8.2). A step job registers `retries: 0` and `timeoutMs` 1 200 000. A step that continues the turn queues the next one, records it as `stepJobId`, and sends the progress chunk `{ type: 'follow', jobId }`, so the UI keeps streaming in one bubble.
- **Statuses.** A session is `idle`, `running`, or `waiting`: suspended on a question, an approval, or subagents, with no job running.
- **Cancel.** `kvcoder.turn.cancel` cancels:
  - the running step;
  - its subagents' turns;
  - its pending questions (a later answer fails `kvcoder/QUESTION_NOT_FOUND`).

  It then adds a notice and sets the session idle. `--async` connector jobs keep running and still report back.
- **Interrupted steps.** A step cut off by a stop or a crash fails with `INTERRUPTED` or `WORKER_CRASHED`, and since it has no retries, it ends `failed` (§2.3). kvcoder registers a `kernel.job.failed` handler: when the failed job is a step, it ends the turn (`interrupted` for `INTERRUPTED`, else `failed`), adds a notice, and sets the session idle; a subagent's interrupted step ends its parent's turn too. The handler queues nothing (ADR 0009, 95). The person sends a message to go on. Suspended turns survive restarts.
- **Background results.** When an `--async` call or an async subagent ends, its result is appended as a `user` message with `source: { kind: 'job', jobId }` (or `{ kind: 'subagent', sessionId }`), read by the next step. It doesn't dismiss pending questions, and it starts a turn only when the session is idle; one that was interrupted or cancelled starts none (ADR 0009, 89 and 95).
- **Errors.** `kvcoder/SESSION_NOT_FOUND`, `kvcoder/SESSION_BUSY` (compacting while a step runs), `kvcoder/JOB_NOT_FOUND`, `kvcoder/NAME_TAKEN`, and `kvcoder/QUESTION_NOT_FOUND` (ADR 0009, 92). Subagent sessions are for reading: every command that names one fails `VALIDATION_FAILED`, except `kvcoder.question.answer` (ADR 0009, 102).
- **Delete.** `kvcoder.session.delete` cancels the session's turn, stops its background processes (ADR 0009, 150), and deletes its subagent sessions too.
- **Compaction.** Before each step, tokens are estimated (characters / 4) against the model's window.
  - Above `kvcoder.compactAt`, kvai summarizes the older messages, the last 10 are kept whole, and a summary message is stored. Older messages stay visible but aren't sent.
  - `kvcoder.session.compact` compacts by hand.
  - A failed summary adds a notice and the step goes on; `kvai/CONTEXT_TOO_LONG` then ends the turn.
- **Limits.** A turn ends with a notice after `kvcoder.maxSteps` steps. When `kvcoder.sessions.keep` is above 0, the oldest idle top-level sessions beyond it are deleted daily: creating a session schedules `kvcoder.session.prune` in its workspace with the key `session-prune` (§2.4), daily at 03:00 (ADR 0009, 103). The default, 0, keeps every session.

## 8.2 A step

1. **Build the prompt**, in this order:
   - the base prompt: English, telling the model to reply in `kernel.language` unless the person writes in another language. It names the shell and the OS, and says each shell call starts in the workspace folder, so `cd` doesn't carry over;
   - the sections, by `order` (§8.4);
   - the connector index: each registered connector's name and description (binary connectors only when their check passed).
2. **Call the model.** `kvai.complete` with the session's model and thinking level, its messages (after the summary), and the one tool, `bash { title, description, command, mode?, timeoutMs? }` (or `powershell` with the same input on Windows): `title` is two to six words in the imperative and `description` one sentence for the person, both required and shown in the UI (ADR 0009, 143). Deltas stream to the UI.
3. **Handle the answer.**
   - **Tool calls.** All calls of the reply start together (§8.3). Shell calls that need approval are asked together, and the turn suspends until every pending item is answered. Then kvcoder appends the results in the model's call order and queues the next step.
   - **No calls.** The session goes idle, unless messages arrived while the step ran, in which case another step runs.

## 8.3 How a shell call runs

| The command is | It runs as |
|---|---|
| `<connector> <command> '<json>'` for a commands connector (or the JSON on stdin: a bash heredoc, or a PowerShell here-string `@' … '@`), standing alone | the registered kernel command, through `ctx.exec`; the result is the output as JSON text, or `error <code>: <message>` with exit code 1 |
| the same with `--async` | kvcoder's own job `kvcoder.connector.run` (which runs the command); prints `started <jobId>`. When it ends, the result is appended as a message, and starts a turn if the session is idle. |
| `<connector> -h` / `<connector> <command> -h` (commands connectors) | the connector's commands with descriptions / that command's description, input and output JSON Schemas, and examples |
| `ask …`, `subagent run …` | built-in connectors that suspend the turn (§8.5) |
| `jobs list`, `jobs get <id>`, `jobs cancel <id>` | built-in connector commands for the work this session started with `--async` (connector calls, and async subagents by their child session id) or with `mode: 'async'` (background processes by their id): the newest 50 as `[{ id, kind, call, status, startedAt, endedAt?, exitCode? }]`, one row plus its `output` (a process's last 100 lines) or `problem`, or a cancel (`{ "cancelled": true }`, `false` for a process that has already ended); another id fails `kvcoder/JOB_NOT_FOUND` (ADR 0009, 81, 88, and 151) |
| a connector word inside a pipe, `&&`, `;`, or other shell syntax | not run: the result explains that connector calls stand alone, with exit code 1 |
| anything else, including binary connectors (`gh …`) | the real shell (below) |

kvcoder parses a line the same way in both shells; single quotes are literal in both. A connector call may leave the JSON out (`preview stop`); its input is then `{}`. Both stdin forms are accepted on every OS, `--async` may stand anywhere after the connector word, and a call stands alone when it's one simple command (no pipe but the here-string's, no `&&`, `||`, `;`, `&`, redirection, `$( )`, backticks, or second line). Errors print `error <code>: <message>` with exit 1 (ADR 0009, 100).

**What the model gets.** Every call returns plain text: the output (cut at 30 KB), then `[exit code N]`; a connector's output is its JSON indented by 2 spaces; a timeout adds `[timed out after N s; the process tree was killed]` and exits 124; a denied call returns `denied by the user`. The shell-result card's fields go in the toolResult's `details` (ADR 0009, 93).

**The real shell.**
- Linux and macOS: `bash -lc <command>`. Windows: `pwsh -NoProfile -Command <command>` when PowerShell 7 is on the PATH, otherwise `powershell.exe -NoProfile -Command <command>`. `kvcoder.shell.path` overrides the lookup on every OS. Calls run in the workspace folder, with an empty stdin and kvman's environment (ADR 0009, 101).
- **Approval.** With `kvcoder.shell.approval: 'ask'` (the default), the call first becomes an `ask confirm` question, and the turn suspends. A denied call returns "denied by the user".
- **Timeout.** The default is 120 s; the model may ask for up to 600 s (a larger `timeoutMs` is cut to 600 s, ADR 0009, 101). On timeout or cancel, the process tree is killed: its group on Linux and macOS, `taskkill /PID <pid> /T /F` on Windows.
- **Sync or async.** `mode` is `'sync'` (the default) or `'async'` (ADR 0009, 149). A sync call is as described here. An async call needs the same approval, then starts the command in the real shell through the kernel's process service (`ctx.processes.start`, in the workspace folder; plan 02 §2.16), waits 1 s for its first output, and returns `started <id>`, the output so far, and `[exit code 0]` (plus `[the process has already ended; jobs get <id> has its output]` when it has). It has no timeout, so `timeoutMs` is ignored.
- **Background jobs.** An async process is a job of the chat (ADR 0009, 150). Its status is `running`, `succeeded`, `failed`, `cancelled`, or `interrupted`, and kvcoder records each way it ends: the `kernel.process.exited` handler for an exit by itself, its own stop for `jobs cancel` and the person's Stop, a `kernel.stopping` handler when kvman stops, and a `kernel.started` handler for a kvman that died. The records are in kvcoder's global store, since the last two handlers run in Home. An exit by itself and the person's stop add a background message with the outcome and the last 20 lines of output at once; an `interrupted` one is reported at the chat's next message. None starts a turn (a handler's jobs carry the `fromHandler` mark, plan 02 §2.15). It runs until it ends or is stopped; deleting the chat stops it, and a turn's Stop button doesn't.
- **Background processes.** A call ends when its shell exits, not when every process that holds its output has closed it. On Linux and macOS, whatever is left in the shell's process group is then killed, and the result says `[background processes were stopped when the command ended; use mode "async" to keep one running]` before the exit code; nothing outlives a call. A process that left the group can't be stopped, so output gets at most 1 s to drain after the shell exits. Windows can't kill what a finished shell left, so there the call ends and the leftover keeps running (ADR 0009, 148).
- **Output.** stdout and stderr are combined. Output over 30 KB keeps its first and last 15 KB around a `[… N bytes omitted …]` marker; connector results are cut the same way. The result includes the exit code.

## 8.4 Extending kvcoder

Other extensions extend kvcoder by calling its public commands. kvcoder keeps what they register in its own store, and reads only its own store while running a turn. It never calls other extensions to build a prompt.

**A connector** is a word the agent can type in the shell. There are two kinds.

```ts
// A commands connector: `ext new '<json>'` runs kvdev's own public command.
await ctx.exec('kvcoder.connector.register', {
  name: 'ext',                                   // the word the agent types
  description: 'Create and test kvman extensions.',
  commands: [{
    name: 'new',                                 // the second word: ext new '<json>'
    command: 'kvdev.ext.new',                    // your own public command
    examples: [{ description: 'Scaffold a notes extension', input: { name: 'notes', namespace: 'notes', folder: './notes' } }],
  }],
});

// A binary connector: a program on the system, run in the real shell.
await ctx.exec('kvcoder.connector.register', {
  name: 'gh',
  description: 'GitHub CLI.',
  binary: { check: 'gh --version', install: 'https://cli.github.com' },
});
```

- **Two kinds.** A connector has exactly one of `commands` or `binary`.
- **Commands connectors** run their commands through `ctx.exec`, with no shell. So validation, `--async`, cancel, retries, and timeouts are the kernel's. `-h` is built from each command's registered description and JSON Schema (through `kernel.extensions.list`) and its `examples`. A `command` must be a public command or query of the extension registering it, or the call fails with `VALIDATION_FAILED`; a query can't run with `--async` (ADR 0009, 129).
- **Binary connectors** are run by the agent in the real shell, and `-h` is the program's own. One is listed in the prompt only when its `check` passes; checks run at a session's first step (5 s timeout each, no approval, passing on exit 0), and the results are stored in the session record. The setting `kvcoder.connectors` adds binary connectors from the preset or the person.

**Sections** are text in the system prompt. The owner pushes them whenever its data changes:

```ts
await ctx.exec('kvcoder.section.set', { id: 'guide', title: 'Extension guide', order: 20, global: true, content: guide });
await ctx.exec('kvcoder.section.set', { id: 'open-todos', title: 'Open todos', order: 40, sessionId, content: list });
await ctx.exec('kvcoder.section.remove', { id: 'open-todos', sessionId });
```

- **Reach.** A section with `global: true` is in every prompt of every workspace. One with `sessionId` is in that session's prompts only. One with neither is in every prompt of the job's workspace.
- Caps: 16 KB per section, 64 KB in total (`TOO_LARGE`): `section.set` checks the global sections, the job's workspace's, and the session's together; a prompt build that still finds more leaves out the last sections by `order` and logs a warning (ADR 0009, 94).
- **Ids** belong to their owner: two extensions may both have `guide`, and `section.remove` touches only the caller's (ADR 0009, 94).

**Where entries live.** Connectors, session handlers, handler-job ids, and global sections are in kvcoder's global store. Sessions and the other sections are in the workspace store.

**Ownership and lifetime.**
- **Ownership.** The caller (`ctx.job.caller`) owns what it registers, and only the owner replaces or removes it. A connector name owned by another extension fails with `kvcoder/NAME_TAKEN`.
- **Connectors last one run.** kvcoder clears them in its own `kernel.started` handler. That handler runs first, because registering extensions declare kvcoder as a dependency (§2.15). Each extension then registers its connectors again in its own `kernel.started` handler. A hot reload of kvcoder reruns its dependents' handlers too (§2.9).

  ```ts
  ctx.registerHandler('kernel.started', {
    description: 'Registers kvdev connectors with kvcoder.',
    handle: () => ctx.exec('kvcoder.connector.register', { … }),
  });
  ```
- **Sections are stored until removed.**
- **Stale entries.** When kvcoder reads, it ignores any connector or section whose owner isn't loaded.

**Session points.** An extension can have one of its commands called when something happens to a session:

```ts
ctx.registerHandler('kernel.started', {
  description: 'Registers todo cleanup with kvcoder.',
  handle: () => ctx.exec('kvcoder.handler.register', { point: 'kvcoder.session.deleted', command: 'todo.session.forget' }),
});
```

| Point | Input |
|---|---|
| `kvcoder.session.created` | `{ sessionId, parentId? }` |
| `kvcoder.session.deleted` | `{ sessionId }` |
| `kvcoder.session.forked` | `{ fromSessionId, toSessionId, throughSeq }` |
| `kvcoder.turn.started` | `{ sessionId, turnId }` |
| `kvcoder.turn.ended` | `{ sessionId, turnId, outcome, usage, durationMs }` |
| `kvcoder.session.waiting` | `{ sessionId, kind: 'question' \| 'approval' \| 'subagent' }` |

- **Calls.** For each occurrence, kvcoder queues one async job per registered handler (its own `kvcoder.handler.run`, which runs the handler's command nested, ADR 0009, 110). Inputs carry ids and totals, never message contents; a handler reads the messages with `kvcoder.message.list` if it needs them.
- **Registration.** The `command` must be the caller's own public command. Each extension has at most one handler per point; registering again replaces it. Handlers are owned by the caller and cleared at each start, like connectors.
- **Loop safety.** kvcoder stores the ids of the handler jobs it queues. A message injected by one of them (a job whose `ctx.job.rootId` is such an id) is stored but doesn't start a turn; the next turn sees it. Work that a handler queues with `execAsync` isn't recognized, so a handler must not inject from there.
- **Access.** Every extension can use kvcoder's public API: read sessions, messages, and turns; create, configure, rename, delete, fork, and export sessions; inject messages; add notes; cancel turns. Only `message.send` and `question.answer` are for the person; an extension calling them fails `NOT_PUBLIC` (ADR 0009, 105).

**Testing.** `runConnector(kernel, 'ext new \'{…}\'')` from `@kvman/kvcoder/testing`, used with `createTestKernel`, parses a line exactly as kvcoder does and returns `{ output, exitCode }`, including for `-h`, stdin JSON in both shells, and non-standalone lines. It runs connector lines only: `ask`, `subagent`, and `jobs` calls, and plain shell lines, return exit 1, and it never starts a shell (ADR 0009, 96).

## 8.5 Built-in connectors

**ask** suspends the turn until the person answers. The answer becomes the shell result, and a dismissal gives `{ "dismissed": true }`.

| Call | Result |
|---|---|
| `ask text '{ "prompt", "placeholder"? }'` | `{ "text" }` |
| `ask choice '{ "prompt", "multiple", "options": [{ "id", "label", "description"? }] (2–10), "other"? }'` | `{ "selected": [ids], "other"? }` |
| `ask confirm '{ "prompt", "danger"? }'` | `{ "confirmed" }` |

- The step sends a component chunk `{ type: 'component', component: 'kvcoder.question', props }`, so the conversation shows the question card inline. A pending question is also in the turn record, so the card shows again after a reload.
- The person answers with `kvcoder.question.answer` (user only). `answer` has the shape of the result above, or `{ "dismissed": true }`. That appends the result and queues the next step, and the card follows that step.

**subagent** runs a hidden child session:

```
subagent run '{ "task", "mode": "fresh" | "fork", "connectors"?: [names], "shell"?: true }'
```

- **Modes.** `fresh` gives the child the base prompt, the sections, and the task. `fork` gives it a copy of the parent's messages so far (plus its summary), then the task.
- **Model.** The child uses its parent's model and thinking level.
- **Connectors.** `connectors` is a subset of the parent's (default: all). `subagent` is never included, so depth is 1, and `ask` always is. `shell: false` allows connector calls only.
- **Waiting.** The parent's turn suspends until the child ends, and the child's final answer becomes the shell result.
  - Several runs in one reply run in parallel.
  - `--async` lets the parent continue; the answer arrives later as a message.
- **Questions.** A child's approvals and questions show in the root session's conversation.
- **Results.** A child that ends `done` returns its last answer's text; any other outcome returns `subagent ended <outcome>` and that text, with exit 1. An async run prints `started <childSessionId>`. Unknown `connectors`, or `subagent` among them, give an error result; with `shell: false`, real-shell calls and binary connectors are refused (ADR 0009, 102).

## 8.6 API

| Name | Kind | Input → output |
|---|---|---|
| `kvcoder.session.create` | command | `{ title? }` → `Session` |
| `kvcoder.session.list` | query | `{ limit }` → top-level `Session[]`, newest first |
| `kvcoder.session.get` | query | `{ sessionId }` → `Session` |
| `kvcoder.session.rename` | command | `{ sessionId, title }` → `{}` |
| `kvcoder.session.configure` | command | `{ sessionId, model?, thinking? }` → `{}`: applies from the next step |
| `kvcoder.session.delete` | command | `{ sessionId }` → `{}`: cancels its turn, stops its background processes, deletes its subagent sessions |
| `kvcoder.session.compact` | command | `{ sessionId }` → `{}` |
| `kvcoder.message.send` | command, user only | `{ sessionId, text, fileIds? }` → `{}` |
| `kvcoder.message.inject` | command | `{ sessionId, text, fileIds? }` → `{}`: starts a turn when the session is idle, unless it comes from a handler job (§8.4) |
| `kvcoder.note.add` | command | `{ sessionId, key, params? }` → `{}`: a display-only note (§8.1); never starts a turn |
| `kvcoder.message.list` | query | `{ sessionId, limit }` → `{ messages, omitted }` (the newest `limit`, in order) |
| `kvcoder.turn.cancel` | command | `{ sessionId }` → `{}` |
| `kvcoder.turn.list` | query | `{ sessionId, limit }` → `Turn[]`, newest first |
| `kvcoder.session.export` | command | `{ sessionId }` → `{ fileId }`: a kernel file `<title>.json` with `{ session, turns, messages }`, subagent sessions included |
| `kvcoder.session.fork` | command | `{ sessionId, throughSeq? }` → `Session`: a copy of the messages (and the current summary) through `throughSeq` (default: all); per-session sections aren't copied |
| `kvcoder.question.answer` | command, user only | `{ questionId, answer }` → `{ jobId }`: the next step's job, or `null` while other items of the step are pending (ADR 0009, 91) |
| `kvcoder.session.count` | query | `{ status? }` → `{ count }` of top-level sessions, for the status item (ADR 0009, 97) |
| `kvcoder.job.list` | query, user only | `{ sessionId }` → `[{ id, kind: 'process' \| 'connector' \| 'subagent', title, call, status, startedAt, endedAt?, exitCode?, links }]`: the chat's newest 50 background jobs, running first; `links` are the localhost URLs in a process's last 100 output lines (ADR 0009, 152) |
| `kvcoder.job.get` | query, user only | `{ sessionId, id }` → the row plus `output` (`kvcoder/JOB_NOT_FOUND` for another chat's id) |
| `kvcoder.job.cancel` | command, user only | `{ sessionId, id }` → `{}`: stops a running process, cancels a connector job or subagent |
| `kvcoder.prompt.get` | query | `{ sessionId }` → the exact system prompt |
| `kvcoder.connector.register` | command | `{ name, description, commands: [{ name, command, examples? }] }` or `{ name, description, binary: { check, install? } }` → `{}` |
| `kvcoder.connector.unregister` | command | `{ name }` → `{}` (the owner only: another owner's fails `kvcoder/NAME_TAKEN`, a missing name does nothing, ADR 0009, 106) |
| `kvcoder.connector.list` | query | `{}` → `[{ name, description, owner, kind: 'commands' \| 'binary', commands?, binary? }]` |
| `kvcoder.section.set` | command | `{ id, title, order, content, global?, sessionId? }` → `{}` (`global` and `sessionId` exclude each other) |
| `kvcoder.section.remove` | command | `{ id, global?, sessionId? }` → `{}` |
| `kvcoder.section.list` | query | `{ sessionId? }` → `[{ id, title, order, owner, global, sessionId?, size }]` |
| `kvcoder.handler.register` | command | `{ point, command }` → `{}` |
| `kvcoder.handler.unregister` | command | `{ point }` → `{}`: removes the caller's own handler, if any (ADR 0009, 106) |
| `kvcoder.handler.list` | query | `{}` → `[{ point, command, owner }]` |

All are public, except the private jobs `kvcoder.turn.step`, `kvcoder.connector.run`, `kvcoder.session.prune`, `kvcoder.session.title` (ADR 0009, 99), and `kvcoder.handler.run` (ADR 0009, 110). `Session`, `Message`, and `Turn` are as in §8.1.

## 8.7 UI and settings

kvcoder owns its conversation UI. kvwebui only hosts it: kvcoder contributes pages through `kvcoder.ui.get`, and the preset decides where they appear (the `coder` preset makes `kvcoder.chat` the home page).

**UI.**
- The **Chat** page `kvcoder.chat`: the session list and the conversation with no session, a large input that asks what to build; sending creates the chat (`kvcoder.session.create`, then `kvcoder.message.send`) and opens its page (ADR 0009, 104).
- The `kvcoder.session` page, with a `sessionId` param: the session list and the conversation.
- **The session list** is kvcoder's custom component `kvcoder.sessions`: translated titles, each session's status (running, or "Needs you" while waiting), times grouped into Today and Earlier, the open chat highlighted, and a "New chat" button back to the Chat page (ADR 0009, 104).
- **The conversation** is kvcoder's custom component `kvcoder.conversation { sessionId }`. It:
  - shows the messages from `kvcoder.message.list`, with notices and notes translated, and "N earlier messages" with the export;
  - streams the running step (`kvman.stream`): text deltas into the pending answer, thinking deltas open while they stream, a tool call's title and description as its arguments complete, component chunks inline, and follow chunks continuing in the same bubble; an activity line tells what the step is doing, with seconds (ADR 0009, 142);
  - makes an answered question or approval leave at once, and reads the session again without waiting for the next step (ADR 0009, 141);
  - reattaches to the running step after a reload, through the session's `stepJobId`;
  - shows pending questions from the turn record;
  - shows a **Running** chip in its header while the chat has background jobs running: `● 2 running ▾` opens a popover with each job's title, time running, localhost links (new tab), Logs, and Stop; it reads `kvcoder.job.list` after every step and answer and every 5 s while something runs (ADR 0009, 153);
  - shows each turn's time, tokens, and cost, and the session's totals and model picker (`kvcoder.session.configure`) in its header; the picker is a searchable popover that groups models by provider title, for ready providers and the session's own model (ADR 0009, 136 and 140); times and numbers use the page's language (ADR 0009, 132);
  - has a send box with image attachments (`POST /api/files`, then `fileIds`), and a Stop button that runs `kvcoder.turn.cancel`;
  - renders Markdown through `kvman.View`;
  - streams a subagent's steps in its card (the `subagent` chunk), shows "Summarizing earlier messages…" between `compaction` chunks (ADR 0009, 99), and shows background results as a small card;
  - has its own tabs, Chat and **Prompt**; Prompt shows `kvcoder.prompt.get` with each section's owner, reach, and size, and a Copy button (kvwebui has no `tabs`, ADR 0009, 68 and 104);
  - has a menu with Rename, Fork into a new chat, Export as JSON, Summarize earlier messages now, and Delete (after a confirmation), and "Fork from here" on each message (ADR 0009, 104).
- **Custom components:** the conversation, the session list (`kvcoder.sessions`), the question card (`kvcoder.question`; one reply's approvals share one card, with "Allow all"), and the shell-result card (the command, exit code, and collapsible output; `http://127.0.0.1:<port>…` and `http://localhost:<port>…` URLs in any output are links that open in a new tab, ADR 0009, 120).
- **Status items:** the count of waiting sessions, from `kvcoder.session.count` (ADR 0009, 97), and on a chat page the chat's tokens and cost, from `kvcoder.session.get` (ADR 0009, 147); the conversation follows each step's job, so the count reruns when a step ends (ADR 0009, 131). The session list and the conversation sit side by side from 30 rem of conversation width, and stack below (ADR 0009, 130).

**Settings.**

| Setting | Default |
|---|---|
| `kvcoder.model` | `null`: use `kvai.defaultModel` |
| `kvcoder.thinking` | `medium` (`off`, `minimal`, `low`, `medium`, `high`) |
| `kvcoder.maxSteps` | 50 |
| `kvcoder.shell.approval` | `ask` (`auto`) |
| `kvcoder.shell.path` | `null`: find bash, or `pwsh` then `powershell.exe` on Windows |
| `kvcoder.compactAt` | 0.8 |
| `kvcoder.connectors` | `[]` (binary connectors: `{ name, description, binary: { check, install? } }`) |
| `kvcoder.sessions.keep` | 0 (keep all) |
| `kvcoder.welcome` | `kvcoder.welcome.default`: a translation key, or `null` for no welcome |
