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
- **Display-only messages.** A **notice** is kvcoder's own (a cancel, an interruption, a failed summary), shown as `kvcoder.notices.<code>` with its `params`; a `STEP_FAILED` notice's params are `{ code, details }`, the Problem's code and params, and the UI translates them, adding the provider's `reason` after the sentence when there is one, as its JSON `message` when the reason is a JSON error body, cut at 200 characters, with names and the reason kept in order in right-to-left text (ADR 0009, 133, 156, and 210). A **note** is added by any extension with `kvcoder.note.add` and shown as its translation key with `params`. Neither is sent to the model, and adding a note never starts a turn.
- **Titles.** A title is a string, or `{ key }` for a translated title (the welcome session). Until the first turn ends, the title is the first 60 characters of the first user message. Then kvcoder asks `kvai.complete` (the session's model, no tools, `maxTokens` 30) for a 3–6 word title in the conversation's language. `kvcoder.session.rename` overrides it, and a renamed session is never retitled. A failed title call keeps the placeholder.
- **Welcome.** kvcoder registers a `kernel.workspace.opened` handler (§2.15). The `kvcoder.welcome` setting is `null` by default: a new workspace opens on the Chat page with no welcome (ADR 0009, 193). When a preset sets it to a translation key, the handler creates a session titled `{ key: 'kvcoder.welcome.title' }` and adds a note with that key, so a new workspace opens with a greeting in the person's language.
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
- **Delete.** `kvcoder.session.delete` cancels the session's turn, stops its background processes (ADR 0009, 150), and deletes its subagent sessions and its artifacts too (ADR 0009, 175).
- **Compaction.** Before each step, tokens are estimated (characters / 4) against the model's window.
  - Above `kvcoder.compactAt`, kvai summarizes the older messages, the last 10 are kept whole, and a summary message is stored. Older messages stay visible but aren't sent.
  - `kvcoder.session.compact` compacts by hand.
  - A failed summary adds a notice and the step goes on; `kvai/CONTEXT_TOO_LONG` then ends the turn.
- **Limits.** A turn ends with a notice after `kvcoder.maxSteps` steps. When `kvcoder.sessions.keep` is above 0, the oldest idle top-level sessions beyond it are deleted daily: creating a session schedules `kvcoder.session.prune` in its workspace with the key `session-prune` (§2.4), daily at 03:00 (ADR 0009, 103). The default, 0, keeps every session.

## 8.2 A step

1. **Build the prompt**, in this order:
   - the base prompt: English, telling the model to reply in `kernel.language` unless the person writes in another language. It names the shell and the OS, says each shell call starts in the workspace folder, so `cd` doesn't carry over, and then three things (ADR 0009, 163 and 166 to 168):
     - **connectors come first**: when a connector covers a task, the model uses it instead of doing the same through the shell, and uses the shell only for what no connector does;
     - **how it works** (ADR 0009, 180): scale the process to the task, so a small, clear change needs no plan; understand from facts first (the request, then the files, config, tests, and guides), never assuming or inventing a name, path, API, or behavior; resolve gaps and conflicts by calling `ask` with all the questions in one reply and the recommended option first, never asking what looking would answer; plan as the artifact `plan` (§8.5), a checklist written in the same reply as the first call, and for a large, ambiguous, or risky task `ask confirm` on it before executing; execute step by step with the smallest change for each, checked with the project's own check or tests, ticking the step with `artifact edit`; delegate a separate, self-contained part to a subagent when a specialist view or parallel work is worth it, briefing it with its role, the goal, the facts it needs, its limits, and what to return, while a subagent that was given a task does it and returns the result without re-planning; the calls of one reply run at the same time, so calls that depend on each other go in separate replies; a reply with no tool call is the final answer and ends the turn, so when work remains the reply must hold the call that does the next piece, and a reply that only says what the model will do ends the turn with nothing done; what it is about to do is said in the same reply as that call, and it never makes a call that does nothing, such as `true`, to keep going (ADR 0009, 163, 200, and 202); show the person anything long to read or see in an artifact; keep replies short;
   - the sections, by `order` (§8.4);
   - the connector index, under a lead line that says to use the connectors before the shell: each registered connector's name and description (binary connectors only when their check passed), and after the description of a built-in connector, its commands; kvcoder ends every entry with how to get its help, `<name> -h` (and `<name> <command> -h` for a commands connector, ADR 0009, 163, 164, and 167).
2. **Call the model.** `kvai.complete` with the session's model and thinking level, its messages (after the summary), and the one tool, `bash { command, title?, description?, risky?, mode?, timeoutMs? }` (or `powershell` with the same input on Windows): the tool's own description explains connectors with a one-line example and repeats that a connector is used instead of the shell whenever one covers the task (ADR 0009, 167 and 172); `title` (two to six words in the imperative) and `description` (one sentence) are optional, for the person, and shown in the UI, and a blank one is missing (ADR 0009, 143 and 212); a call that leaves out `title` gets the first 60 characters of its `description` (with `…` when cut), a call with neither shows its command, and any other invalid argument fails `VALIDATION_FAILED` with a message that says what the field must be (ADR 0009, 186); `risky` is `true` when the call could lose or damage something that isn't the model's own work, or reaches outside the workspace, and a call that leaves it out counts as `true` (ADR 0009, 161 and 212). Deltas stream to the UI. A call that fails `kvai/RATE_LIMITED`, or `kvai/PROVIDER_ERROR` with `transient: true`, is tried up to 4 times in all, after 1 s, 4 s, and then 15 s, with the chunk `{ type: 'retry', attempt, of }` before each retry; any other failure ends the turn at once (ADR 0009, 155 and 203).
3. **Handle the answer.**
   - **Tool calls.** A call the provider sent without an id gets one, and a call without a name is dropped, so a stored reply never holds a broken call; a reply left with no call by such a drop is a lost reply (ADR 0009, 192). All calls of the reply start together (§8.3). Shell calls that need approval are asked together, and the turn suspends until every pending item is answered. Then kvcoder appends the results in the model's call order and queues the next step.
   - **No calls.** The session goes idle, unless messages arrived while the step ran, in which case another step runs. A reply with no call that was lost on the way (under 400 characters of text, and more than 150 output tokens that its text and its reasoning don't explain, ADR 0009, 191) is not an ending: kvcoder adds a message telling the model so and to send the content in smaller pieces, and runs another step, at most twice in a turn; the next one ends the turn `failed` with the notice `REPLY_LOST` (ADR 0009, 188).

## 8.3 How a shell call runs

| The command is | It runs as |
|---|---|
| `<connector> <command> '<json>'` for a commands connector (or the JSON on stdin: a bash heredoc, or a PowerShell here-string `@' … '@`), standing alone | the registered kernel command, through `ctx.exec`; the result is the output as JSON text, or `error <code>: <message>` with exit code 1 |
| the same with `--async` | kvcoder's own job `kvcoder.connector.run` (which runs the command); prints `started <jobId>`. When it ends, the result is appended as a message, and starts a turn if the session is idle. |
| `<connector> -h` / `<connector> <command> -h` (commands connectors) | the connector's commands with descriptions / that command's description, input and output JSON Schemas, and examples |
| `ask …`, `subagent run …` | built-in connectors that suspend the turn (§8.5) |
| `fs write '<json>'`, `fs edit '<json>'` | built-in connector commands that create, replace, or edit a file inside the workspace folder, run by kvcoder in the step after the same approval as a shell call (§8.5, ADR 0009, 157 and 161) |
| `artifact write '<json>'`, `artifact edit '<json>'`, `artifact get '<json>'` | built-in connector commands that store, change, or read a document shown to the person, run by kvcoder in the step with no approval (§8.5, ADR 0009, 173 to 176) |
| `jobs list`, `jobs get <id>`, `jobs cancel <id>` | built-in connector commands for the work this session started with `--async` (connector calls, and async subagents by their child session id) or with `mode: 'async'` (background processes by their id): the newest 50 as `[{ id, kind, call, status, startedAt, endedAt?, exitCode? }]`, one row plus its `output` (a process's last 100 lines) or `problem`, or a cancel (`{ "cancelled": true }`, `false` for a process that has already ended); another id fails `kvcoder/JOB_NOT_FOUND` (ADR 0009, 81, 88, and 151) |
| a connector word inside a pipe, `&&`, `;`, or other shell syntax | not run: the result explains that connector calls stand alone, with exit code 1 |
| anything else, including binary connectors (`gh …`) | the real shell (below) |

kvcoder parses a line the same way in both shells; single quotes are literal in both. A connector call may leave the JSON out (`preview stop`); its input is then `{}`. Both stdin forms are accepted on every OS, `--async` may stand anywhere after the connector word, and a call stands alone when it's one simple command (no pipe but the here-string's, no `&&`, `||`, `;`, `&`, redirection, `$( )`, backticks, or second line). Errors print `error <code>: <message>` with exit 1 (ADR 0009, 100).

**What the model gets.** Every call returns plain text: the output (cut at 30 KB), then `[exit code N]`; a connector's output is its JSON indented by 2 spaces; a timeout adds `[timed out after N s; the process tree was killed]` and exits 124; a denied call returns `denied by the user`. The shell-result card's fields go in the toolResult's `details` (ADR 0009, 93).

**The real shell.**
- Linux and macOS: `bash -lc <command>`. Windows: `pwsh -NoProfile -Command <command>` when PowerShell 7 is on the PATH, otherwise `powershell.exe -NoProfile -Command <command>`. `kvcoder.shell.path` overrides the lookup on every OS. Calls run in the workspace folder, with an empty stdin and kvman's environment (ADR 0009, 101).
- **Approval.** It covers real shell calls and `fs` calls (`fs -h` never asks), and `kvcoder.shell.approval` is `auto` (the default) or `ask` (ADR 0009, 161). With `auto`, a call whose `risky` is `true` (or left out) asks and any other runs at once; with `ask`, every call asks. A call that asks first becomes an `ask confirm` question, and the turn suspends. A denied call returns "denied by the user".
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

- **Description.** The `description` is what the agent sees in the prompt's connector index (§8.2): write it to say what the connector is for and when to use it, in a sentence or two. kvcoder adds the help hint after it (ADR 0009, 164 and 165).
- **Two kinds.** A connector has exactly one of `commands` or `binary`.
- **Invalid input to a built-in connector** (`ask`, `subagent`, `fs`, `artifact`) fails `VALIDATION_FAILED` with each problem and then the input the command takes, from its `-h` text, so one correction is enough (ADR 0009, 213).
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

**Testing.** `runConnector(kernel, 'ext new \'{…}\'')` from `@kvman/kvcoder/testing`, used with `createTestKernel`, parses a line exactly as kvcoder does and returns `{ output, exitCode }`, including for `-h`, stdin JSON in both shells, and non-standalone lines. It runs connector lines only: `ask`, `subagent`, `jobs`, `fs`, and `artifact` calls, and plain shell lines, return exit 1, and it never starts a shell (ADR 0009, 96).

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

**fs** writes and edits files inside the workspace folder (ADR 0009, 157 to 160):

| Call | Result |
|---|---|
| `fs write '{ "path", "content" }'`, or `fs write '{ "path" }'` with the content as the heredoc body | creates the file and its parent folders, or replaces it: `{ "path", "created", "bytes" }` |
| `fs edit '{ "path", "edits": [{ "oldText", "newText" }] }'` | replaces text in an existing file: `{ "path", "replacements", "firstChangedLine" }` |

- **Content as the body.** A `write` may leave `content` out of its JSON and give it as the heredoc body, raw and unescaped, as `cat` would write it (every line ends with a line break; an empty body is empty); `content` in the JSON together with a body fails `VALIDATION_FAILED`. Use it for whole files: a model that must JSON-escape a large file inside a heredoc inside a call often loses the call (ADR 0009, 187, 188).
- **Paths.** A relative `path` resolves against the workspace folder; an absolute one works when it is inside it. A path that leaves the folder, through `..` or a symlink, fails `VALIDATION_FAILED` and writes nothing.
- **Matching.** Every `oldText` is matched exactly against the file as it was before the call, must be non-empty and occur once, and must not overlap another one; the edits apply together. If any check fails, or the result equals the file, nothing is written and the error names the edit and why. A missing file fails `NOT_FOUND`; a file that isn't valid UTF-8 text is refused. CRLF line endings and a leading BOM are kept.
- **Order.** Calls on the same file run one after another, in the model's order when they start together. Unknown keys fail `VALIDATION_FAILED`, and `fs -h` lists the commands.

**artifact** shows the person a document beside the conversation: a plan, a report, a design, or a page (ADR 0009, 173 to 179):

| Call | Result |
|---|---|
| `artifact write '{ "id", "title", "format"?, "content" }'`, or the same without `content` and with it as the heredoc body | creates the artifact, or replaces it (title, format, and content): `{ "id", "version", "created", "bytes" }` |
| `artifact edit '{ "id", "edits": [{ "oldText", "newText" }] }'` | replaces text in an existing artifact: `{ "id", "version", "replacements", "firstChangedLine" }` |
| `artifact get '{ "id" }'` | `{ "id", "title", "format", "version", "content" }` |

- **Shape.** `id` is lowercase kebab case, up to 50 characters, and names the artifact within its chat (`plan` is the plan, §8.2). `title` is 1 to 100 characters. `format` is `markdown`, `html`, or `url`; left out, it is `html` for content that starts with `<!doctype html` or `<html`, `url` for content that is one local address, and `markdown` for anything else (ADR 0009, 215 and 216). `content` is text up to 64 KB (`TOO_LARGE`, `params.limit`). A chat holds at most 20 artifacts: creating the 21st fails `TOO_LARGE`. `version` starts at 1 and rises with every write or edit; only the latest content is kept. An unknown `id` in `edit` or `get` fails `NOT_FOUND`; unknown keys, a bad `id`, or a bad `format` fail `VALIDATION_FAILED`.
- **Content as the body.** `artifact write` takes its content as the heredoc body in the same way as `fs write`, the content left out of the JSON (ADR 0009, 187); a whole HTML page is best given this way.
- **Edits** follow the matching rules of `fs edit`: every `oldText` is matched exactly once against the content as it was, edits don't overlap, and nothing is written when a check fails, the edits change nothing, or the result would pass 64 KB.
- **Order and ownership.** Calls on the same artifact run one after another, in the model's order when they start together. An artifact belongs to its chat; a subagent's belongs to the chat at its root, so the person sees a helper's report. No approval is asked.
- **URL.** A `url` artifact's `content` is one http or https address on `localhost` or `127.0.0.1`, with no credentials (anything else fails `VALIDATION_FAILED`), such as a dev server the agent started; it is shown in a frame that runs scripts only, and never when it is kvman's own address (ADR 0009, 216). `edit` re-checks the address.
- **HTML.** An `html` artifact is shown in an isolated frame (§8.7): its scripts run, but it can't load from or reach the network, kvman's page, or the person's browser data.

## 8.6 API

| Name | Kind | Input → output |
|---|---|---|
| `kvcoder.session.create` | command | `{ title? }` → `Session` |
| `kvcoder.session.list` | query | `{ limit }` → top-level `Session[]`, newest first |
| `kvcoder.session.get` | query | `{ sessionId }` → `Session` |
| `kvcoder.session.rename` | command | `{ sessionId, title }` → `{}` |
| `kvcoder.session.configure` | command | `{ sessionId, model?, thinking? }` → `{}`: applies from the next step |
| `kvcoder.session.delete` | command | `{ sessionId }` → `{}`: cancels its turn, stops its background processes, deletes its subagent sessions and its artifacts |
| `kvcoder.session.compact` | command | `{ sessionId }` → `{}` |
| `kvcoder.message.send` | command, user only | `{ sessionId, text, fileIds? }` → `{}` |
| `kvcoder.message.inject` | command | `{ sessionId, text, fileIds? }` → `{}`: starts a turn when the session is idle, unless it comes from a handler job (§8.4) |
| `kvcoder.note.add` | command | `{ sessionId, key, params? }` → `{}`: a display-only note (§8.1); never starts a turn |
| `kvcoder.message.list` | query | `{ sessionId, limit }` → `{ messages, omitted }` (the newest `limit`, in order) |
| `kvcoder.turn.cancel` | command | `{ sessionId }` → `{}` |
| `kvcoder.turn.list` | query | `{ sessionId, limit }` → `Turn[]`, newest first |
| `kvcoder.session.export` | command | `{ sessionId }` → `{ fileId }`: a kernel file `<title>.json` with `{ session, turns, messages, artifacts }`, subagent sessions included |
| `kvcoder.session.fork` | command | `{ sessionId, throughSeq? }` → `Session`: a copy of the messages (and the current summary) through `throughSeq` (default: all); per-session sections and artifacts aren't copied |
| `kvcoder.question.answer` | command, user only | `{ questionId, answer }` → `{ jobId }`: the next step's job, or `null` while other items of the step are pending (ADR 0009, 91) |
| `kvcoder.session.count` | query | `{ status? }` → `{ count }` of top-level sessions, for the status item (ADR 0009, 97) |
| `kvcoder.job.list` | query, user only | `{ sessionId }` → `[{ id, kind: 'process' \| 'connector' \| 'subagent', title, call, status, startedAt, endedAt?, exitCode?, links }]`: the chat's newest 50 background jobs, running first; `links` are the localhost URLs in a process's last 100 output lines (ADR 0009, 152) |
| `kvcoder.job.get` | query, user only | `{ sessionId, id }` → the row plus `output` (`kvcoder/JOB_NOT_FOUND` for another chat's id) |
| `kvcoder.job.cancel` | command, user only | `{ sessionId, id }` → `{}`: stops a running process, cancels a connector job or subagent |
| `kvcoder.prompt.get` | query | `{ sessionId }` → the exact system prompt |
| `kvcoder.artifact.list` | query | `{ sessionId }` → `[{ id, title, format, version, size, updatedAt }]` of the chat, newest change first; a subagent session answers with its chat's (ADR 0009, 176) |
| `kvcoder.artifact.get` | query | `{ sessionId, id }` → `{ id, title, format, version, content, createdAt, updatedAt }` (`NOT_FOUND` for an unknown id) |
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
- The **Chat** page `kvcoder.chat`: the session list and the conversation with no session, the header of a chat with the model picker and the thinking select at the top (showing what the chat would use), the question, and a large input at the bottom that asks what to build; sending creates the chat (`kvcoder.session.create`, then `kvcoder.session.configure` with what the person changed, then `kvcoder.message.send`) and opens its page. When the model's provider needs a key, or there is no model, a line under the question says so (with an "Add a key" link to the provider's page) and sending is off (ADR 0009, 104 and 194).
- The `kvcoder.session` page, with a `sessionId` param: the session list and the conversation.
- **The session list** is kvcoder's custom component `kvcoder.sessions`: translated titles, each session's status (running, or "Needs you" while waiting), times grouped into Today and Earlier, the open chat highlighted, and a "New chat" button back to the Chat page (ADR 0009, 104).
- **The conversation** is kvcoder's custom component `kvcoder.conversation { sessionId }`. It:
  - shows the messages from `kvcoder.message.list`, with notices and notes translated, and "N earlier messages" with the export;
  - streams the running step (`kvman.stream`): text deltas into the pending answer, thinking deltas open while they stream, a tool call's title and description as its arguments complete, component chunks inline, and follow chunks continuing in the same bubble; an activity line tells what the step is doing, with seconds, and "Retrying… (2 of 4)" while a failed model call is tried again (ADR 0009, 142 and 155);
  - makes an answered question or approval leave at once, and reads the session again without waiting for the next step (ADR 0009, 141);
  - reattaches to the running step after a reload, through the session's `stepJobId`;
  - shows pending questions from the turn record;
  - shows a **Running** chip in its header while the chat has background jobs running: `● 2 running ▾` opens a popover with each job's title, time running, localhost links (new tab), Logs, and Stop; it reads `kvcoder.job.list` after every step and answer and every 5 s while something runs (ADR 0009, 153);
  - shows each turn's time, tokens, and cost, and the session's totals and model picker (`kvcoder.session.configure`) in its header; the picker is a searchable popover that groups models by provider title, for ready providers and the session's own model (ADR 0009, 136 and 140); times and numbers use the page's language (ADR 0009, 132);
  - has a send box with image attachments (`POST /api/files`, then `fileIds`), and a Stop button that runs `kvcoder.turn.cancel`;
  - renders Markdown through `kvman.View`;
  - streams a subagent's steps in its card (the `subagent` chunk), shows "Summarizing earlier messages…" between `compaction` chunks (ADR 0009, 99), and shows background results as a small card;
  - has its own tabs, Chat and **Prompt**; Prompt shows `kvcoder.prompt.get` with each section's owner, reach, and size, and a Copy button (kvwebui has no `tabs`, ADR 0009, 68 and 104);
  - shows an `artifact write` or `artifact edit` result as a compact card (title, version, Open) instead of a shell-result card, from the result's `details.artifact` (ADR 0009, 177);
  - has an **artifact panel** beside it (over it below 48 rem): it shows one artifact at a time, with a row of titles when the chat has several, the version, and a Close button. It opens when an artifact appears whose id wasn't there when the chat was opened (the `plan` included), when the person clicks a card, and when the person presses the header's `Artifacts (N)` button (shown while the chat has artifacts; it opens and closes the panel), and an update to one already shown doesn't reopen a panel the person closed; it reads `kvcoder.artifact.list` after every step and answer and every 5 s while nothing streams. A chat with no artifact has no panel (ADR 0009, 177);
  - gives the artifact panel a Preview and Source switch (Source is the text as stored, in a monospace block; Preview is the default and returns when another artifact is shown) and a Copy button that puts the stored text on the clipboard (ADR 0009, 214); a `url` artifact's Preview is its page in `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" src>`, with an "Open in a new tab" link, shown only for an http or https address on `localhost` or `127.0.0.1` other than kvman's own port, and a line saying so otherwise (ADR 0009, 216);
  - shows a Markdown artifact through the sanitized `markdown` view, and an HTML artifact in an isolated frame: `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc>` (never with `allow-same-origin`, `allow-popups`, `allow-forms`, `allow-top-navigation`, or `allow-modals`) whose document is a wrapper holding the artifact in an inner frame with the same attributes (so the wrapper's policy also stops the artifact navigating its own frame, ADR 0009, 185); both documents start with the policy `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; form-action 'none'; base-uri 'none'` as a `<meta http-equiv="Content-Security-Policy">`, so its scripts run but nothing loads from or reaches the network, the page, or the person's browser data (ADR 0009, 178, 179, and 185);
  - has a menu with Rename, Fork into a new chat, Export as JSON, Summarize earlier messages now, and Delete (after a confirmation), and "Fork from here" on each message (ADR 0009, 104);
  - shows, under an idle chat's last message when it is a `STEP_FAILED`, `REPLY_LOST`, or `INTERRUPTED` notice, two actions: "Retry" and "Choose another model"; Retry sends the message "Continue", and a picked model is set on the chat, remembered as the default model, and followed by "Continue" (ADR 0009, 204);
  - makes every model the person picks (in a chat's header, a new chat's header, or those actions) the global `kvai.defaultModel`, so a new chat starts with it (ADR 0009, 205); the model popover opens at its button and is moved only as far as it takes to stay inside the conversation (ADR 0009, 208 and 211);
  - scrolls its message list inside its own column, with the header above and the send box below always in view (ADR 0009, 130 and 198), and follows the newest message: opening a chat shows its last message; while the person is within 80 px of the end, every change keeps the view at the end; after the person scrolls up it stops, a "Jump to latest" button appears, and the button or sending a message returns to the end (ADR 0009, 199); a cost is a left-to-right run inside right-to-left text (ADR 0009, 197).
- **Custom components:** the conversation, the session list (`kvcoder.sessions`), the question card (`kvcoder.question`; one reply's approvals share one card, with "Allow all"), and the shell-result card (the call's title, or the one derived from its description, then its description when that says more, the command cut to one line, all starting at the card's inline start, and the time; a failed call has a danger-colored border and there is no exit chip; opened, it shows the whole command and the output in dark blocks, with no block for an empty output; `http://127.0.0.1:<port>…` and `http://localhost:<port>…` URLs in any output are links that open in a new tab, ADR 0009, 120, 195, 196, 206, and 207).
- **Status items:** the count of waiting sessions, from `kvcoder.session.count` (ADR 0009, 97), and on a chat page the chat's tokens and cost, from `kvcoder.session.get` (ADR 0009, 147); the conversation follows each step's job, so the count reruns when a step ends (ADR 0009, 131). The session list and the conversation sit side by side from 30 rem of conversation width, and stack below (ADR 0009, 130).

**Settings.**

| Setting | Default |
|---|---|
| `kvcoder.model` | `null`: use `kvai.defaultModel` |
| `kvcoder.thinking` | `medium` (`off`, `minimal`, `low`, `medium`, `high`) |
| `kvcoder.maxSteps` | 50 |
| `kvcoder.shell.approval` | `auto`: ask only for a risky call (`ask`: ask for every call) |
| `kvcoder.shell.path` | `null`: find bash, or `pwsh` then `powershell.exe` on Windows |
| `kvcoder.compactAt` | 0.8 |
| `kvcoder.connectors` | `[]` (binary connectors: `{ name, description, binary: { check, install? } }`) |
| `kvcoder.sessions.keep` | 0 (keep all) |
| `kvcoder.welcome` | `null`: no welcome; a translation key (such as `kvcoder.welcome.default`) makes the welcome session (ADR 0009, 193) |
