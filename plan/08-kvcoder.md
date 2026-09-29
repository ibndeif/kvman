# 08 — kvcoder (namespace `kvcoder`)

kvcoder is the app-building harness, built on kvai and kvwebui. Its agent has one tool, a shell: `bash` on Linux and macOS, `powershell` on Windows. It reaches everything through that tool. Other extensions extend kvcoder with **connectors** and **sections**. kvcoder owns its conversation UI (§8.7).

## 8.1 Sessions and turns

- **Storage.** Sessions, turns, and messages live in kvcoder's workspace store, so a session exists only in its own workspace, and Home has its own sessions.
- **A session** is `{ id, title, status, parentId?, model, thinking, stepJobId?, usage, durationMs, createdAt, updatedAt }`, plus its binary check results. `stepJobId` is the running step's job, so the UI can reattach to it. Subagents are hidden child sessions with `parentId`.
- **A message:**

  ```
  { id, sessionId, turnId?, seq,
    kind: 'user' | 'assistant' | 'toolResult' | 'notice' | 'summary',
    source?: { kind: 'user' } | { kind: 'extension', name } | { kind: 'subagent', sessionId },
    content,            // a pi-ai message, a notice { code, params, text }, or a summary { text, coversThroughSeq }
    fileIds?,           // attached images (user messages)
    model?, usage?: { input, output, cacheRead, cacheWrite, cost },
    durationMs?,        // the model call (assistant) or the run time (toolResult)
    createdAt }
  ```
- **A turn** records `{ id, startedAt, endedAt, durationMs, steps, usage, outcome: 'done' | 'cancelled' | 'failed' | 'interrupted' | 'maxSteps' }`. While suspended, it also holds its `pending` calls (`{ toolCallId, kind: 'question' | 'subagent' | 'approval', questionId?, childSessionId? }`) and the results already produced in that step. When the last pending call resolves, kvcoder appends all results in the model's call order and queues the next step.
- **Totals.** The session keeps running totals of `usage` and `durationMs`, and a subagent's usage adds to its parent's. The conversation shows each turn's time, tokens, and cost under its last answer, and the session's totals in its header.
- **Titles.** Until the first turn ends, the title is the first 60 characters of the first message. Then kvcoder asks `kvai.complete` (the session's model, no tools, `maxTokens` 30) for a 3–6 word title in the conversation's language. `kvcoder.session.rename` overrides it, and a renamed session is never retitled. A failed title call keeps the placeholder.
- **Model.** A session starts with `kvcoder.model` (or `kvai.defaultModel` when that is `null`) and `kvcoder.thinking`. `kvcoder.session.configure` changes either from the next step.
- **Long histories.** `kvcoder.message.list` returns the newest `limit` messages, plus `omitted`, the number of older ones. The conversation shows "N earlier messages" and offers the export.
- **Sending.**
  - `kvcoder.message.send` is for the person only. When the session is idle, it starts a turn and sends the chunk `{ type: 'follow', jobId }` for the first step, so the UI streams the turn. When a turn is running, the message steers it: the next step sees it.
  - When the session is waiting, a message dismisses the pending questions and denies the pending approvals (the model sees "dismissed by the user" or "denied by the user"), is appended, and the next step runs.
  - `kvcoder.message.inject` does the same for extensions, and marks the message as coming from that extension.
  - Both take `fileIds?`: kernel files that are images, for a model whose `input` includes `image`. Any other file, or an image for a text-only model, fails `VALIDATION_FAILED`. Images are read from the files at each step, not copied into the store.
- **Steps.** A turn is a chain of async jobs, one per step (§8.2). A step job registers `retries: 0` and `timeoutMs` 1 200 000. A step that continues the turn queues the next one, records it as `stepJobId`, and sends the progress chunk `{ type: 'follow', jobId }`, so the UI keeps streaming in one bubble.
- **Statuses.** A session is `idle`, `running`, or `waiting`: suspended on a question, an approval, or subagents, with no job running.
- **Cancel.** `kvcoder.turn.cancel` cancels:
  - the running step;
  - its subagents' turns;
  - its pending questions (a later answer fails `kvcoder/QUESTION_NOT_FOUND`).

  It then adds a notice and sets the session idle. `--async` connector jobs keep running and still report back.
- **Interrupted steps.** A step cut off by a stop or a crash fails with `INTERRUPTED` or `WORKER_CRASHED`, and since it has no retries, it ends `failed` (§2.3). kvcoder registers a `kernel.job.failed` handler: when the failed job is a step, it ends the turn (`interrupted` for `INTERRUPTED`, else `failed`), adds a notice, and sets the session idle. The person sends a message to go on. Suspended turns survive restarts.
- **Delete.** `kvcoder.session.delete` cancels the session's turn and deletes its subagent sessions too.
- **Compaction.** Before each step, tokens are estimated (characters / 4) against the model's window.
  - Above `kvcoder.compactAt`, kvai summarizes the older messages, the last 10 are kept whole, and a summary message is stored. Older messages stay visible but aren't sent.
  - `kvcoder.session.compact` compacts by hand.
  - A failed summary adds a notice and the step goes on; `kvai/CONTEXT_TOO_LONG` then ends the turn.
- **Limits.** A turn ends with a notice after `kvcoder.maxSteps` steps. When `kvcoder.sessions.keep` is above 0, the oldest idle top-level sessions beyond it are deleted daily: creating a session schedules `kvcoder.session.prune` in its workspace with the key `session-prune` (§2.4). The default, 0, keeps every session.

## 8.2 A step

1. **Build the prompt**, in this order:
   - the base prompt: English, telling the model to reply in `kernel.language` unless the person writes in another language. It names the shell and the OS, and says each shell call starts in the workspace folder, so `cd` doesn't carry over;
   - the sections, by `order` (§8.4);
   - the connector index: each registered connector's name and description (binary connectors only when their check passed).
2. **Call the model.** `kvai.complete` with the session's model and thinking level, its messages (after the summary), and the one tool, `bash { command, description, timeoutMs? }` (or `powershell` with the same input on Windows). Deltas stream to the UI.
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
| `jobs list`, `jobs cancel <id>` | built-in connector commands for `--async` jobs |
| a connector word inside a pipe, `&&`, `;`, or other shell syntax | not run: the result explains that connector calls stand alone, with exit code 1 |
| anything else, including binary connectors (`gh …`) | the real shell (below) |

kvcoder parses a line the same way in both shells; single quotes are literal in both. A connector call may leave the JSON out (`preview stop`); its input is then `{}`.

**The real shell.**
- Linux and macOS: `bash -lc <command>`. Windows: `pwsh -NoProfile -Command <command>` when PowerShell 7 is on the PATH, otherwise `powershell.exe -NoProfile -Command <command>`. `kvcoder.shell.path` overrides the lookup on every OS. Calls run in the workspace folder.
- **Approval.** With `kvcoder.shell.approval: 'ask'` (the default), the call first becomes an `ask confirm` question, and the turn suspends. A denied call returns "denied by the user".
- **Timeout.** The default is 120 s; the model may ask for up to 600 s. On timeout or cancel, the process tree is killed: its group on Linux and macOS, `taskkill /PID <pid> /T /F` on Windows.
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
- **Commands connectors** run their commands through `ctx.exec`, with no shell. So validation, `--async`, cancel, retries, and timeouts are the kernel's. `-h` is built from each command's registered description and JSON Schema (through `kernel.extensions.list`) and its `examples`. A `command` must be a public command of the extension registering it, or the call fails with `VALIDATION_FAILED`.
- **Binary connectors** are run by the agent in the real shell, and `-h` is the program's own. One is listed in the prompt only when its `check` passes; checks run at a session's first step (5 s timeout each), and the results are stored in the session record. The setting `kvcoder.connectors` adds binary connectors from the preset or the person.

**Sections** are text in the system prompt. The owner pushes them whenever its data changes:

```ts
await ctx.exec('kvcoder.section.set', { id: 'guide', title: 'Extension guide', order: 20, global: true, content: guide });
await ctx.exec('kvcoder.section.set', { id: 'open-todos', title: 'Open todos', order: 40, sessionId, content: list });
await ctx.exec('kvcoder.section.remove', { id: 'open-todos', sessionId });
```

- **Reach.** A section with `global: true` is in every prompt of every workspace. One with `sessionId` is in that session's prompts only. One with neither is in every prompt of the job's workspace.
- Caps: 16 KB per section, 64 KB in total (`TOO_LARGE`).

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

- **Calls.** For each occurrence, kvcoder queues one async job per registered handler. Inputs carry ids and totals, never message contents; a handler reads the messages with `kvcoder.message.list` if it needs them.
- **Registration.** The `command` must be the caller's own public command. Each extension has at most one handler per point; registering again replaces it. Handlers are owned by the caller and cleared at each start, like connectors.
- **Loop safety.** kvcoder stores the ids of the handler jobs it queues. A message injected by one of them (a job whose `ctx.job.rootId` is such an id) is stored but doesn't start a turn; the next turn sees it. Work that a handler queues with `execAsync` isn't recognized, so a handler must not inject from there.
- **Access.** Every extension can use kvcoder's public API: read sessions, messages, and turns; create, configure, rename, delete, fork, and export sessions; inject messages; cancel turns. Only `message.send` and `question.answer` are for the person.

**Testing.** `runConnector(kernel, 'ext new \'{…}\'')` from `@kvman/kvcoder/testing`, used with `createTestKernel`, parses a line exactly as kvcoder does and returns `{ output, exitCode }`, including for `-h`, stdin JSON in both shells, and non-standalone lines.

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

## 8.6 API

| Name | Kind | Input → output |
|---|---|---|
| `kvcoder.session.create` | command | `{ title? }` → `Session` |
| `kvcoder.session.list` | query | `{ limit }` → top-level `Session[]`, newest first |
| `kvcoder.session.get` | query | `{ sessionId }` → `Session` |
| `kvcoder.session.rename` | command | `{ sessionId, title }` → `{}` |
| `kvcoder.session.configure` | command | `{ sessionId, model?, thinking? }` → `{}`: applies from the next step |
| `kvcoder.session.delete` | command | `{ sessionId }` → `{}`: cancels its turn, deletes its subagent sessions |
| `kvcoder.session.compact` | command | `{ sessionId }` → `{}` |
| `kvcoder.message.send` | command, user only | `{ sessionId, text, fileIds? }` → `{}` |
| `kvcoder.message.inject` | command | `{ sessionId, text, fileIds? }` → `{}`: starts a turn when the session is idle, unless it comes from a handler job (§8.4) |
| `kvcoder.message.list` | query | `{ sessionId, limit }` → `{ messages, omitted }` (the newest `limit`, in order) |
| `kvcoder.turn.cancel` | command | `{ sessionId }` → `{}` |
| `kvcoder.turn.list` | query | `{ sessionId, limit }` → `Turn[]`, newest first |
| `kvcoder.session.export` | command | `{ sessionId }` → `{ fileId }`: a kernel file `<title>.json` with `{ session, turns, messages }`, subagent sessions included |
| `kvcoder.session.fork` | command | `{ sessionId, throughSeq? }` → `Session`: a copy of the messages (and the current summary) through `throughSeq` (default: all); per-session sections aren't copied |
| `kvcoder.question.answer` | command, user only | `{ questionId, answer }` → `{ jobId }` |
| `kvcoder.prompt.get` | query | `{ sessionId }` → the exact system prompt |
| `kvcoder.connector.register` | command | `{ name, description, commands: [{ name, command, examples? }] }` or `{ name, description, binary: { check, install? } }` → `{}` |
| `kvcoder.connector.unregister` | command | `{ name }` → `{}` (the owner only) |
| `kvcoder.connector.list` | query | `{}` → `[{ name, description, owner, kind: 'commands' \| 'binary', commands?, binary? }]` |
| `kvcoder.section.set` | command | `{ id, title, order, content, global?, sessionId? }` → `{}` (`global` and `sessionId` exclude each other) |
| `kvcoder.section.remove` | command | `{ id, global?, sessionId? }` → `{}` |
| `kvcoder.section.list` | query | `{ sessionId? }` → `[{ id, title, order, owner, global, sessionId?, size }]` |
| `kvcoder.handler.register` | command | `{ point, command }` → `{}` |
| `kvcoder.handler.unregister` | command | `{ point }` → `{}` (the owner only) |
| `kvcoder.handler.list` | query | `{}` → `[{ point, command, owner }]` |

All are public, except the private jobs `kvcoder.turn.step`, `kvcoder.connector.run`, and `kvcoder.session.prune`. `Session`, `Message`, and `Turn` are as in §8.1.

## 8.7 UI and settings

kvcoder owns its conversation UI. kvwebui only hosts it: kvcoder contributes pages through `kvcoder.ui.get`, and the preset decides where they appear (the `coder` preset makes `kvcoder.chat` the home page).

**UI.**
- The **Chat** page `kvcoder.chat`: a session list (a `list` of `link`s to `kvcoder.session`) with a "New chat" button that runs `kvcoder.session.create`, then navigates to the new session (`then: { navigate: 'kvcoder.session', params: { sessionId: { "$output": "id" } } }`).
- The `kvcoder.session` page, with a `sessionId` param: the session list and the conversation.
- **The conversation** is kvcoder's custom component `kvcoder.conversation { sessionId }`. It:
  - shows the messages from `kvcoder.message.list`, with "N earlier messages" and the export;
  - streams the running step (`kvman.stream`): text deltas into the pending answer, thinking deltas collapsed, component chunks inline, and follow chunks continuing in the same bubble;
  - reattaches to the running step after a reload, through the session's `stepJobId`;
  - shows pending questions from the turn record;
  - shows each turn's time, tokens, and cost, and the session's totals and model picker (`kvcoder.session.configure`) in its header;
  - has a send box with image attachments (`POST /api/files`, then `fileIds`), and a Stop button that runs `kvcoder.turn.cancel`;
  - renders Markdown through `kvman.View`.
- **Custom components:** the conversation, the question card (`kvcoder.question`), and the shell-result card (the command, exit code, and collapsible output).
- A **status item** with the count of waiting sessions.
- A **Prompt** tab showing `kvcoder.prompt.get`.

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
