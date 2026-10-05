# 08 — kvcoder (namespace `kvcoder`)

kvcoder is the app-building harness, built on kvai and kvwebui. Its agent has one tool, `run`, which runs one command of a **connector** (ADR 0011). A connector is the only way the agent reaches anything outside the model: the shell, files, the person, other agents, and other extensions. Other extensions extend kvcoder with connectors and **sections**. kvcoder owns its conversation UI (§8.7).

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
- **A turn** records `{ id, startedAt, endedAt, durationMs, steps, usage, outcome: 'done' | 'cancelled' | 'failed' | 'interrupted' | 'maxSteps' }`. While suspended, it also holds its `pending` calls (`{ toolCallId, kind: 'question' | 'subagent' | 'approval', questionId?, question?, childSessionId? }`, where `question` is the `ask` input with its `kind`, or an approval's `{ description, connector, command, payload }`, ADR 0009, 102, and ADR 0011) and the results already produced in that step. When the last pending call resolves, kvcoder appends all results in the model's call order and queues the next step.
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

  It then adds a notice and sets the session idle. Background processes keep running and still report back.
- **Interrupted steps.** A step cut off by a stop or a crash fails with `INTERRUPTED` or `WORKER_CRASHED`, and since it has no retries, it ends `failed` (§2.3). kvcoder registers a `kernel.job.failed` handler: when the failed job is a step, it ends the turn (`interrupted` for `INTERRUPTED`, else `failed`), adds a notice, and sets the session idle; a subagent's interrupted step ends its parent's turn too. The handler queues nothing (ADR 0009, 95). The person sends a message to go on. Suspended turns survive restarts.
- **Background results.** When a background process or a background subagent ends, its result is appended as a `user` message with `source: { kind: 'job', jobId }` (or `{ kind: 'subagent', sessionId }`), read by the next step. It doesn't dismiss pending questions. A subagent's result starts a turn only when the session is idle, and one that was interrupted or cancelled starts none; a process's result never starts one (§8.3, ADR 0009, 89 and 95).
- **Errors.** `kvcoder/SESSION_NOT_FOUND`, `kvcoder/SESSION_BUSY` (compacting while a step runs), `kvcoder/JOB_NOT_FOUND`, `kvcoder/NAME_TAKEN`, and `kvcoder/QUESTION_NOT_FOUND` (ADR 0009, 92). Subagent sessions are for reading: every command that names one fails `VALIDATION_FAILED`, except `kvcoder.question.answer` (ADR 0009, 102).
- **Delete.** `kvcoder.session.delete` cancels the session's turn, stops its background processes (ADR 0009, 150), and deletes its subagent sessions and its artifacts too (ADR 0009, 175).
- **Compaction.** Before each step, tokens are estimated (characters / 4) against the model's window.
  - Above `kvcoder.compactAt`, kvai summarizes the older messages, the last 10 are kept whole, and a summary message is stored. Older messages stay visible but aren't sent.
  - `kvcoder.session.compact` compacts by hand.
  - A failed summary adds a notice and the step goes on; `kvai/CONTEXT_TOO_LONG` then ends the turn.
- **Limits.** A turn ends with a notice after `kvcoder.maxSteps` steps. When `kvcoder.sessions.keep` is above 0, the oldest idle top-level sessions beyond it are deleted daily: creating a session schedules `kvcoder.session.prune` in its workspace with the key `session-prune` (§2.4), daily at 03:00 (ADR 0009, 103). The default, 0, keeps every session.

## 8.2 A step

1. **Build the prompt**, in this order:
   - the base prompt: English, telling the model to reply in `kernel.language` unless the person writes in another language. It names the OS and the workspace folder, describes the one tool `run` and its four arguments, says each `shell exec` starts in the workspace folder, so `cd` doesn't carry over, and then two things (ADR 0009, 163 and 166 to 168; ADR 0011):
     - **connectors**: everything the model does goes through a connector's command; when a connector other than `shell` covers a task, the model uses it instead of a shell line, and uses `shell` only for what no other connector does; a command the connector index lists with its payload needs no `help` call, and for any other command, and for what a field means, it calls the connector's `help` before the first use (ADR 0012, 1 and 15);
     - **how it works** (ADR 0009, 180): scale the process to the task, so a task of one file or a few steps needs no plan (ADR 0012, 11); understand from facts first (the request, then the files, config, tests, and guides), never assuming or inventing a name, path, API, or behavior; resolve gaps and conflicts by asking, one question per `ask` call with all the calls in one reply, and `ask choice` whenever options are offered, the recommended one first (ADR 0012, 5), never asking what looking would answer; plan as the artifact `plan` (§8.5), a checklist written in the same reply as the first call, and for a large, ambiguous, or risky task `ask confirm` on it before executing; execute step by step with the smallest change for each, each file written in its own call, checked with the project's own check or tests, ticking the step with `artifact edit`; before saying that something runs or works, it checks it the way the person would (runs it, requests its address, or runs its test), and when it couldn't, says what is unchecked (ADR 0012, 10); delegate a separate, self-contained part to a subagent when a specialist view or parallel work is worth it, briefing it with its role, the goal, the facts it needs, its limits, and what to return, while a subagent that was given a task does it and returns the result without re-planning; the calls of one reply run at the same time, so calls that depend on each other go in separate replies; a reply with no tool call is the final answer and ends the turn, so when work remains the reply must hold the call that does the next piece, and a reply that only says what the model will do ends the turn with nothing done; what it is about to do is said in the same reply as that call, and it never makes a call that does nothing, such as `true`, to keep going (ADR 0009, 163, 200, and 202); show the person anything long to read or see in an artifact; keep replies short;
   - the sections, by `order` (§8.4);
   - the connector index: each connector's name and description (binary connectors only when their check passed), then its commands, which kvcoder adds from the registration, so the index always names every command (ADR 0011, 3). A registered connector and a binary connector get `Commands: <names>, help.` on the same line. Each of kvcoder's six connectors (§8.5) gets one line per command instead, `help` last, indented by 2 spaces: the command's name, padded to the widest one of the connector, then its signature (§8.3), so the model knows these payloads without a `help` call (ADR 0012, 1 and 14).
2. **Call the model.** `kvai.complete` with the session's model and thinking level, its messages (after the summary), and the one tool, `run { description, connector, command, payload? }` (ADR 0011, 1): `description` is one sentence for a person who knows nothing about the harness, saying what the call does, and is shown in the UI; `connector` is one of the session's connectors, an enum in the tool's schema; `command` is one of that connector's commands; `payload` is the command's input, `{}` when left out, and parsed when sent as a JSON string. The tool's own description explains the four arguments with one example and says to call `help` for a command's payload. A call to any other tool ("the tool is run, not bash"), a blank or missing `description`, an unknown connector, or a payload that isn't an object fails `VALIDATION_FAILED` with a message that says what is wrong and what the field must be. Deltas stream to the UI. A call that fails `kvai/RATE_LIMITED`, or `kvai/PROVIDER_ERROR` with `transient: true`, is tried up to 4 times in all, after 1 s, 4 s, and then 15 s, with the chunk `{ type: 'retry', attempt, of }` before each retry; any other failure ends the turn at once (ADR 0009, 155 and 203).
3. **Handle the answer.**
   - **Tool calls.** A call the provider sent without an id gets one, and a call without a name is dropped, so a stored reply never holds a broken call; a reply left with no call by such a drop is a lost reply (ADR 0009, 192). All calls of the reply start together (§8.3). Calls that need approval are asked together, and the turn suspends until every pending item is answered. Then kvcoder appends the results in the model's call order and queues the next step.
   - **No calls.** The session goes idle, unless messages arrived while the step ran, in which case another step runs. A reply with no call that was lost on the way (under 400 characters of text, and more than 150 output tokens that its text and its reasoning don't explain, ADR 0009, 191) is not an ending: kvcoder adds a message telling the model so and to send the content in smaller pieces, and runs another step, at most twice in a turn; the next one ends the turn `failed` with the notice `REPLY_LOST` (ADR 0009, 188).

## 8.3 How a call runs

| The call is | It runs as |
|---|---|
| `help` of any connector | `help {}`: the connector's description and its commands with their descriptions; `help { command }`: that command's description, input and output JSON Schemas, and examples, each shown as `run` arguments. A binary connector's `help` also prints the program's own help (§8.4). The result is plain text. It never asks. |
| a command of a commands connector | the registered kernel command or query, through `ctx.exec`, with the payload as its input |
| `shell exec`, `<binary> exec` | the real shell (below) |
| `ask …`, `subagent run` | checked, then the turn suspends (§8.5) |
| `fs …`, `artifact …`, `background …` | kvcoder's own commands (§8.5) |
| a command the connector doesn't have | `error NOT_FOUND: <connector> has no command <command>; call its help.` |
| a connector this subagent wasn't given | `error VALIDATION_FAILED: <connector> isn't available in this subagent.` |

**Every command is a kernel job.** A connector command, built-in or registered, is a kernel command or query that kvcoder runs with `ctx.exec`, on the step's worker (plan 02 §2.1). So validation, cancel, and timeouts are the kernel's, and there is no `--async`: a call runs to its end inside the step (ADR 0011, 6 and 10). kvcoder's built-in ones are its own private registrations, each taking `{ sessionId, payload }` (`kvcoder.connector.help.get` takes `{ connector, command? }`): `kvcoder.shell.run`, `kvcoder.binary.run` (with `connector`), `kvcoder.fs.write`, `kvcoder.fs.edit`, `kvcoder.fs.file.get`, `kvcoder.fs.entry.list`, `kvcoder.fs.text.search`, `kvcoder.artifact.write`, `kvcoder.artifact.edit`, `kvcoder.artifact.content.get`, `kvcoder.background.list`, `kvcoder.background.output.get`, `kvcoder.background.stop`, `kvcoder.ask.text.check`, `kvcoder.ask.choice.check`, `kvcoder.ask.confirm.check`, `kvcoder.subagent.check`, and `kvcoder.connector.help.get`. Their payload schemas are strict, with a description on every field.

**Signatures** (ADR 0012, 3). A command's signature is its payload written from its JSON Schema, such as `{ id, title, format?: "markdown" | "html" | "url", content }` or `{ path, edits: [{ oldText, newText }], risky? }`. A field is its name, with `?` when it isn't required. An object field with properties is expanded as `name: { … }`, and an array whose items are such an object as `name: [{ … }]`. A field whose schema is an enum of strings lists its values, `mode: "fresh" | "fork"`. Any other field is its name only. Fields keep the schema's order, and a payload with no field is `{}`. A payload schema that isn't an object with properties has no signature.

**Invalid payloads.** A payload that doesn't fit its command fails `VALIDATION_FAILED` with each problem, then `The payload of <connector> <command> is` and, on the next line, the command's signature, so one correction is enough (ADR 0012, 2). When the payload has no signature, the message ends `The payload of <connector> <command> is (JSON Schema):` and, on the next line, the JSON Schema on one line without `$schema` (ADR 0012, 4).

**What the model gets** (ADR 0011, 11). A connector command returns its output as JSON indented by 2 spaces; a failure returns `error <code>: <message>`. `shell exec` and a binary's `exec` return the raw output (cut at 30 KB), then `[exit code N]` (a background start differs, below); a timeout adds `[timed out after N s; the process tree was killed]` and exits 124. A denied call returns `denied by the user`. The call card's fields go in the toolResult's `details`: `{ description, connector, command, output, durationMs, exitCode?, timedOut?, background?, jobId?, artifact? }`; the card reads the payload from the call itself (ADR 0009, 93).

**The real shell** runs `shell exec`'s `line`, and for a binary connector the line `<name> <args>`.
- Linux and macOS: `bash -lc <line>`. Windows: `pwsh -NoProfile -Command <line>` when PowerShell 7 is on the PATH, otherwise `powershell.exe -NoProfile -Command <line>`. `kvcoder.shell.path` overrides the lookup on every OS. Calls run in the workspace folder, with an empty stdin and kvman's environment (ADR 0009, 101).
- **Payload.** `shell exec { line, background?, timeoutMs?, risky? }`; a binary's `exec { args, background?, timeoutMs?, risky? }`, where `args` may be left out.
- **Approval.** It covers `shell exec`, a binary's `exec`, `fs write`, and `fs edit` (`help` never asks), and `kvcoder.shell.approval` is `auto` (the default) or `ask` (ADR 0009, 161). With `auto`, a call whose payload has `risky: true` (or leaves it out) asks and any other runs at once; with `ask`, every such call asks. `risky` is `true` when the call could lose or damage something that isn't the model's own work, or reaches outside the workspace (ADR 0009, 161 and 212; ADR 0011, 7). A call that asks becomes an approval question holding `{ description, connector, command, payload }`, and the turn suspends; the approved call runs at the start of the next step. A denied call returns "denied by the user".
- **Timeout.** The default is 120 s; the model may ask for up to 600 s (a larger `timeoutMs` is cut to 600 s, ADR 0009, 101). On timeout or cancel, the process tree is killed: its group on Linux and macOS, `taskkill /PID <pid> /T /F` on Windows.
- **Background.** `background: true` (ADR 0009, 149; ADR 0011, 6) needs the same approval, then starts the line in the real shell through the kernel's process service (`ctx.processes.start`, in the workspace folder; plan 02 §2.16), waits 1 s for its first output (the startup second), and returns `started <id>`, the output so far, and how the process stands (ADR 0012, 7): `[running]` when it still runs; `[the process has already ended]` and `[exit code N]`, its real code, when it exited; `[the process has already ended]` and `[killed by <signal>]` when a signal killed it. An exit with a code other than 0 and a kill are error results; `details.exitCode` is set only for an exit. The end is read from the process's record: a process that has died without its end recorded yet counts as running, and its end arrives as a background message (ADR 0012, 9). It has no timeout, so `timeoutMs` is ignored. The agent follows it up with the `background` connector (§8.5).
- **Background runs.** A background process belongs to its chat (ADR 0009, 150). Its status is `running`, `succeeded`, `failed`, `cancelled`, or `interrupted`, and kvcoder records each way it ends: the `kernel.process.exited` handler for an exit by itself, its own stop for `background stop` and the person's Stop, a `kernel.stopping` handler when kvman stops, and a `kernel.started` handler for a kvman that died. The records are in kvcoder's global store, since the last two handlers run in Home. An exit by itself and the person's stop add a background message with the outcome and the last 20 lines of output at once, except an exit inside the startup second, which the start result already carries (ADR 0012, 8); an `interrupted` one is reported at the chat's next message. None starts a turn (a handler's jobs carry the `fromHandler` mark, plan 02 §2.15). It runs until it ends or is stopped; deleting the chat stops it, and a turn's Stop button doesn't.
- **Leftover processes.** A call ends when its shell exits, not when every process that holds its output has closed it. On Linux and macOS, whatever is left in the shell's process group is then killed, and the result says `[background processes were stopped when the command ended; set background to true to keep one running]` before the exit code; nothing outlives a call. A process that left the group can't be stopped, so output gets at most 1 s to drain after the shell exits. Windows can't kill what a finished shell left, so there the call ends and the leftover keeps running (ADR 0009, 148).
- **Output.** stdout and stderr are combined. Output over 30 KB keeps its first and last 15 KB around a `[… N bytes omitted …]` marker; connector results are cut the same way, except those of `fs read`, `fs list`, and `fs search`, which limit themselves (ADR 0011, 23).

**Old calls** (ADR 0011, 12). A chat stored before `run` keeps its `bash` and `powershell` calls, and its history is sent unchanged. A turn found waiting on an approval of such a call never runs it: whatever the answer, its result is `denied by the user`, then `Make this call again with the run tool.`

## 8.4 Extending kvcoder

Other extensions extend kvcoder by calling its public commands. kvcoder keeps what they register in its own store, and reads only its own store while running a turn. It never calls other extensions to build a prompt.

**A connector** is a named set of commands the agent runs with `run`. There are two kinds.

```ts
// A commands connector: run { connector: 'ext', command: 'new', payload } runs kvcustomizer's own public command.
await ctx.exec('kvcoder.connector.register', {
  name: 'ext',                                   // the run tool's `connector`
  description: 'Create and test kvman extensions.',
  commands: [{
    name: 'new',                                 // the run tool's `command`
    command: 'kvcustomizer.ext.new',                    // your own public command; the payload is its input
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

- **Description.** The `description` is what the agent sees in the prompt's connector index (§8.2): write it to say what the connector is for and when to use it, in a sentence or two. kvcoder adds the command names after it (ADR 0009, 164 and 165; ADR 0011, 3).
- **Two kinds.** A connector has exactly one of `commands` or `binary`.
- **Several at once.** `kvcoder.connector.register { connectors: [ … ] }` registers several connectors, each shaped as above, in one call: every one is checked first and all are stored together, so the call registers all of them or none, and a name given twice fails `VALIDATION_FAILED` (ADR 0011, 26).
- **Names.** `shell`, `fs`, `artifact`, `background`, `ask`, and `subagent` are kvcoder's own: registering one fails `kvcoder/NAME_TAKEN`. Every connector has `help` (§8.3), so a command named `help` fails `VALIDATION_FAILED` (ADR 0011, 4).
- **Commands connectors** run their commands through `ctx.exec`, with the payload as the input. So validation, cancel, retries, and timeouts are the kernel's. `help` is built from each command's registered description and JSON Schema (through `kernel.extensions.list`) and its `examples`. A `command` must be a public command or query of the extension registering it (checked through `kernel.registrations.list`, ADR 0011, 25), or the call fails with `VALIDATION_FAILED` (ADR 0009, 129).
- **Binary connectors** have two commands (ADR 0011, 5): `exec { args?, background?, timeoutMs?, risky? }` runs the line `<name> <args>` in the real shell, with the approval, timeout, and background rules of `shell exec` (§8.3); `help {}` describes `exec` and `help` and then prints the output of `<name> --help`; `help { command: 'exec' }` gives `exec`'s payload; `help { command }` with any other command prints the output of `<name> <command> --help`. The program runs with a 5 s timeout and no approval. A registration may give `binary.help`, the line to run instead, in which `{command}` stands for the command, or for nothing when none is asked (`go help {command}`). One is listed in the prompt, and can be called, only when its `check` passes; checks run at a session's first step (5 s timeout each, no approval, passing on exit 0), and the results are stored in the session record. The setting `kvcoder.connectors` adds binary connectors from the preset or the person.

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
    description: 'Registers kvcustomizer connectors with kvcoder.',
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

**Testing.** `runConnector(kernel, { connector: 'ext', command: 'new', payload: { … } })` from `@kvman/kvcoder/testing`, used with `createTestKernel`, runs a call exactly as kvcoder does and returns `{ output, exitCode }`, including for `help`. It runs commands connectors and the `help` of built-in ones: any other built-in call, and a binary connector's, returns exit 1, and it never starts a shell (ADR 0009, 96; ADR 0011, 18).

## 8.5 Built-in connectors

`shell` is in §8.3. Unknown keys in a payload fail `VALIDATION_FAILED`.

**ask** suspends the turn until the person answers. The answer becomes the call's result, and a dismissal gives `{ "dismissed": true }`.

| Call | Result |
|---|---|
| `ask text { prompt, placeholder? }` | `{ "text" }` |
| `ask choice { prompt, multiple, options: [{ id, label, description? }] (2–10), other? }` | `{ "selected": [ids], "other"? }` |
| `ask confirm { prompt, danger? }` | `{ "confirmed" }` |

- `kvcoder.ask.text.check`, `.choice.check`, or `.confirm.check` validates the payload (ADR 0011, 9). The step then sends a component chunk `{ type: 'component', component: 'kvcoder.question', props }`, so the conversation shows the question card inline. A pending question is also in the turn record, so the card shows again after a reload.
- The person answers with `kvcoder.question.answer` (user only). `answer` has the shape of the result above, or `{ "dismissed": true }`. That appends the result and queues the next step, and the card follows that step.

**subagent** runs a hidden child session:

```
subagent run { task, mode: "fresh" | "fork", connectors?: [names], background?: true }
```

- **Modes.** `fresh` gives the child the base prompt, the sections, and the task. `fork` gives it a copy of the parent's messages so far (plus its summary), then the task.
- **Model.** The child uses its parent's model and thinking level.
- **Connectors.** `connectors` is a subset of the parent's (default: all), and the one list: `shell` and the binary connectors are in it or not (ADR 0011, 9). `subagent` is never included, so depth is 1, and `ask` always is.
- **Waiting.** The parent's turn suspends until the child ends, and the child's final answer becomes the call's result.
  - Several runs in one reply run in parallel.
  - `background: true` lets the parent continue; the answer arrives later as a message.
- **Questions.** A child's approvals and questions show in the root session's conversation.
- **Results.** A child that ends `done` returns its last answer's text; any other outcome returns `subagent ended <outcome>` and that text, as an error. A background run returns `started <childSessionId>`. Unknown `connectors`, or `subagent` among them, give an error result from `kvcoder.subagent.check` (ADR 0009, 102).

**fs** reads, lists, searches, writes, and edits files inside the workspace folder (ADR 0009, 157 to 160; ADR 0011, 8):

| Call | Result |
|---|---|
| `fs read { path, fromLine?, lines? }` | `{ "path", "fromLine", "totalLines", "content" }`: `lines` lines from `fromLine` (1 by default) |
| `fs list { path? }` | `{ "path", "entries": [{ "name", "kind": "file" \| "folder", "bytes" }], "truncated" }`: one folder (the workspace folder by default, and for an empty `path`), not its sub-folders |
| `fs search { pattern, path? }` | `{ "matches": [{ "path", "line", "text" }], "truncated" }`: the lines matching the regular expression `pattern`, in a file or under a folder (the workspace folder by default, and for an empty `path`) |
| `fs write { path, content, risky? }` | creates the file and its parent folders, or replaces it: `{ "path", "created", "bytes" }` |
| `fs edit { path, edits: [{ oldText, newText }], risky? }` | replaces text in an existing file: `{ "path", "replacements", "firstChangedLine" }` |

- **Paths.** A relative `path` resolves against the workspace folder; an absolute one works when it is inside it. A path that leaves the folder, through `..` or a symlink, fails `VALIDATION_FAILED` and reads or writes nothing. A missing file or folder fails `NOT_FOUND`. An empty `path` is the workspace folder for `list` and `search`, and fails `VALIDATION_FAILED` for `read`, `write`, and `edit` (ADR 0012, 12).
- **Reading.** `lines` is 2000 by default and at most 2000 (`VALIDATION_FAILED` beyond); the content holds whole lines up to 30 KB, so it may hold fewer than asked, and `totalLines` lets the agent go on with `fromLine`. A `fromLine` past the end gives an empty `content`. A file that isn't valid UTF-8 text is refused (`VALIDATION_FAILED`), and so is a folder.
- **Listing.** Entries are sorted by name, at most 1000, with `truncated: true` when there are more; `bytes` is 0 for a folder. A path that is a file fails `VALIDATION_FAILED`.
- **Searching.** `pattern` is a JavaScript regular expression, matched line by line, case-sensitive (an invalid one fails `VALIDATION_FAILED`). Files are visited in path order; `node_modules`, `.git`, and every other folder whose name starts with a dot are skipped, and so are files that aren't valid UTF-8 text. At most 200 matches are returned, with `truncated: true` when there are more; `path` is relative to the workspace folder, `line` starts at 1, and `text` is the line cut at 500 characters.
- **Approval.** `write` and `edit` ask as `shell exec` does (§8.3); `read`, `list`, `search`, and `help` never ask.
- **Matching.** Every `oldText` is matched exactly against the file as it was before the call, must be non-empty and occur once, and must not overlap another one; the edits apply together. If any check fails, or the result equals the file, nothing is written and the error names the edit and why. A file that isn't valid UTF-8 text is refused. CRLF line endings and a leading BOM are kept.
- **Order.** Calls on the same file run one after another, in the model's order when they start together.

**artifact** shows the person a document beside the conversation: a plan, a report, a design, or a page (ADR 0009, 173 to 179):

| Call | Result |
|---|---|
| `artifact write { id, title, format?, content }` | creates the artifact, or replaces it (title, format, and content): `{ "id", "version", "created", "bytes" }` |
| `artifact edit { id, edits: [{ oldText, newText }] }` | replaces text in an existing artifact: `{ "id", "version", "replacements", "firstChangedLine" }` |
| `artifact get { id }` | `{ "id", "title", "format", "version", "content" }` |

- **Shape.** `id` is lowercase kebab case, up to 50 characters, and names the artifact within its chat (`plan` is the plan of a larger task, §8.2). `title` is 1 to 100 characters. `format` is `markdown`, `html`, or `url`; left out, it is `html` for content that starts with `<!doctype html` or `<html`, `url` for content that is one local address, and `markdown` for anything else (ADR 0009, 215 and 216). `content` is text up to 64 KB (`TOO_LARGE`, `params.limit`). A chat holds at most 20 artifacts: creating the 21st fails `TOO_LARGE`. `version` starts at 1 and rises with every write or edit; only the latest content is kept. An unknown `id` in `edit` or `get` fails `NOT_FOUND`; unknown keys, a bad `id`, or a bad `format` fail `VALIDATION_FAILED`.
- **Edits** follow the matching rules of `fs edit`: every `oldText` is matched exactly once against the content as it was, edits don't overlap, and nothing is written when a check fails, the edits change nothing, or the result would pass 64 KB.
- **Order and ownership.** Calls on the same artifact run one after another, in the model's order when they start together. An artifact belongs to its chat; a subagent's belongs to the chat at its root, so the person sees a helper's report. No approval is asked.
- **Storage.** An HTML artifact's page, in the panel's scripts-only frame, has an opaque origin, so `localStorage`, `sessionStorage`, cookies, and `indexedDB` throw `SecurityError`; the `artifact` entry in the system prompt says so, and asks for pages that work without them. A `url` artifact's page has its own origin and can use them (ADR 0009, 217 and 218).
- **URL.** A `url` artifact's `content` is one http or https address on `localhost` or `127.0.0.1`, with no credentials (anything else fails `VALIDATION_FAILED`), such as a dev server the agent started; it is shown in a frame that lets the page work as in a tab, and never when it is kvman's own address (ADR 0009, 216 and 218). `edit` re-checks the address.
- **HTML.** An `html` artifact is shown in an isolated frame (§8.7): its scripts run, but it can't load from or reach the network, kvman's page, or the person's browser data.

**background** follows up on what this chat started with `background: true` (ADR 0009, 81, 88, and 151; ADR 0011, 6): processes by their id, and background subagents by their child session id.

| Call | Result |
|---|---|
| `background list {}` | the newest 50, newest first: `[{ "id", "kind": "process" \| "subagent", "call", "status", "startedAt", "endedAt"?, "exitCode"? }]` |
| `background output { id }` | that row plus `output` (a process's last 100 lines, or a subagent's answer) or `problem` |
| `background stop { id }` | stops a process, or cancels a subagent: `{ "stopped": true }`, `false` for one that has already ended |

An id this chat didn't start fails `kvcoder/JOB_NOT_FOUND`. `call` is the line that runs, or the description of the call that started the subagent.

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
| `kvcoder.job.list` | query, user only | `{ sessionId }` → `[{ id, kind: 'process' \| 'subagent', title, call, status, startedAt, endedAt?, exitCode?, links }]`: the chat's newest 50 background jobs, running first; `links` are the localhost URLs in a process's last 100 output lines (ADR 0009, 152) |
| `kvcoder.job.get` | query, user only | `{ sessionId, id }` → the row plus `output` (`kvcoder/JOB_NOT_FOUND` for another chat's id) |
| `kvcoder.job.cancel` | command, user only | `{ sessionId, id }` → `{}`: stops a running process, or cancels a subagent |
| `kvcoder.prompt.get` | query | `{ sessionId }` → the exact system prompt |
| `kvcoder.artifact.list` | query | `{ sessionId }` → `[{ id, title, format, version, size, updatedAt }]` of the chat, newest change first; a subagent session answers with its chat's (ADR 0009, 176) |
| `kvcoder.artifact.get` | query | `{ sessionId, id }` → `{ id, title, format, version, content, createdAt, updatedAt }` (`NOT_FOUND` for an unknown id) |
| `kvcoder.connector.register` | command | `{ name, description, commands: [{ name, command, examples? }] }` or `{ name, description, binary: { check, install?, help? } }`, or `{ connectors: [ … ] }` of either → `{}` |
| `kvcoder.connector.unregister` | command | `{ name }` → `{}` (the owner only: another owner's fails `kvcoder/NAME_TAKEN`, a missing name does nothing, ADR 0009, 106) |
| `kvcoder.connector.list` | query | `{}` → `[{ name, description, owner, kind: 'commands' \| 'binary', commands?, binary? }]` |
| `kvcoder.section.set` | command | `{ id, title, order, content, global?, sessionId? }` → `{}` (`global` and `sessionId` exclude each other) |
| `kvcoder.section.remove` | command | `{ id, global?, sessionId? }` → `{}` |
| `kvcoder.section.list` | query | `{ sessionId? }` → `[{ id, title, order, owner, global, sessionId?, size }]` |
| `kvcoder.handler.register` | command | `{ point, command }` → `{}` |
| `kvcoder.handler.unregister` | command | `{ point }` → `{}`: removes the caller's own handler, if any (ADR 0009, 106) |
| `kvcoder.handler.list` | query | `{}` → `[{ point, command, owner }]` |

All are public, except the private jobs `kvcoder.turn.step`, `kvcoder.session.prune`, `kvcoder.session.title` (ADR 0009, 99), and `kvcoder.handler.run` (ADR 0009, 110), and the built-in connectors' commands and queries (§8.3). `Session`, `Message`, and `Turn` are as in §8.1.

## 8.7 UI and settings

kvcoder owns its conversation UI. kvwebui only hosts it: kvcoder contributes pages through `kvcoder.ui.get`, and the preset decides where they appear (the `coder` preset makes `kvcoder.chat` the home page).

**UI.**
- The **Chat** page `kvcoder.chat`: the session list and the conversation with no session, the header of a chat with the model picker and the thinking select at the top (showing what the chat would use), the question, and a large input at the bottom that asks what to build; sending creates the chat (`kvcoder.session.create`, then `kvcoder.session.configure` with what the person changed, then `kvcoder.message.send`) and opens its page. When the model's provider needs a key, or there is no model, a line under the question says so (with an "Add a key" link to the provider's page) and sending is off (ADR 0009, 104 and 194).
- The `kvcoder.session` page, with a `sessionId` param: the session list and the conversation.
- **The session list** is kvcoder's custom component `kvcoder.sessions`: translated titles, each session's status (running, or "Needs you" while waiting), times grouped into Today and Earlier, the open chat highlighted, and a "New chat" button back to the Chat page (ADR 0009, 104).
- **The conversation** is kvcoder's custom component `kvcoder.conversation { sessionId }`. It:
  - shows the messages from `kvcoder.message.list`, with notices and notes translated, and "N earlier messages" with the export;
  - streams the running step (`kvman.stream`): text deltas into the pending answer, thinking deltas open while they stream, a tool call's description as its arguments complete, component chunks inline, and follow chunks continuing in the same bubble; an activity line tells what the step is doing, with seconds, and "Retrying… (2 of 4)" while a failed model call is tried again (ADR 0009, 142 and 155);
  - makes an answered question or approval leave at once, and reads the session again without waiting for the next step (ADR 0009, 141);
  - reattaches to the running step after a reload, through the session's `stepJobId`;
  - shows pending questions from the turn record;
  - shows a **Running** chip in its header while the chat has background jobs running: `● 2 running ▾` opens a popover with each job's title, time running, localhost links (new tab), Logs, and Stop; it reads `kvcoder.job.list` after every step and answer and every 5 s while something runs (ADR 0009, 153);
  - shows each turn's time, tokens, and cost, and the session's totals and model picker (`kvcoder.session.configure`) in its header; the picker is a searchable popover that groups models by provider title, for ready providers and the session's own model (ADR 0009, 136 and 140); times and numbers use the page's language (ADR 0009, 132);
  - has a send box with image attachments (`POST /api/files`, then `fileIds`), and a Stop button that runs `kvcoder.turn.cancel`;
  - renders Markdown through `kvman.View`;
  - streams a subagent's steps in its card (the `subagent` chunk), shows "Summarizing earlier messages…" between `compaction` chunks (ADR 0009, 99), and shows background results as a small card;
  - has its own tabs, Chat and **Prompt**; Prompt shows `kvcoder.prompt.get` with each section's owner, reach, and size, and a Copy button (kvwebui has no `tabs`, ADR 0009, 68 and 104);
  - shows an `artifact write` or `artifact edit` result as a compact card (title, version, Open) instead of a call card, from the result's `details.artifact` (ADR 0009, 177);
  - has an **artifact panel** beside it (over it below 48 rem): it shows one artifact at a time, with a row of titles when the chat has several, the version, and a Close button. It opens when an artifact appears whose id wasn't there when the chat was opened (the `plan` included), when the person clicks a card, and when the person presses the header's `Artifacts (N)` button (shown while the chat has artifacts; it opens and closes the panel), and an update to one already shown doesn't reopen a panel the person closed; it reads `kvcoder.artifact.list` after every step and answer and every 5 s while nothing streams. A chat with no artifact has no panel (ADR 0009, 177);
  - gives the artifact panel a Preview and Source switch (Source is the text as stored, in a monospace block; Preview is the default and returns when another artifact is shown) and a Copy button that puts the stored text on the clipboard (ADR 0009, 214); a `url` artifact's Preview is its page in `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads" referrerpolicy="no-referrer" src>` (its own origin, never kvman's, and no `allow-top-navigation`, ADR 0009, 218), with an "Open in a new tab" link, shown only for an http or https address on `localhost` or `127.0.0.1` other than kvman's own port, and a line saying so otherwise (ADR 0009, 216);
  - shows a Markdown artifact through the sanitized `markdown` view, and an HTML artifact in an isolated frame: `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc>` (never with `allow-same-origin`, `allow-popups`, `allow-forms`, `allow-top-navigation`, or `allow-modals`) whose document is a wrapper holding the artifact in an inner frame with the same attributes (so the wrapper's policy also stops the artifact navigating its own frame, ADR 0009, 185); both documents start with the policy `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; form-action 'none'; base-uri 'none'` as a `<meta http-equiv="Content-Security-Policy">`, so its scripts run but nothing loads from or reaches the network, the page, or the person's browser data (ADR 0009, 178, 179, and 185);
  - has a menu with Rename, Fork into a new chat, Export as JSON, Summarize earlier messages now, and Delete (after a confirmation), and "Fork from here" on each message (ADR 0009, 104);
  - shows, under an idle chat's last message when it is a `STEP_FAILED`, `REPLY_LOST`, or `INTERRUPTED` notice, two actions: "Retry" and "Choose another model"; Retry sends the message "Continue", and a picked model is set on the chat, remembered as the default model, and followed by "Continue" (ADR 0009, 204);
  - makes every model the person picks (in a chat's header, a new chat's header, or those actions) the global `kvai.defaultModel`, so a new chat starts with it (ADR 0009, 205); the model popover opens at its button and is moved only as far as it takes to stay inside the conversation, and fitted again on every frame while it is open (ADR 0009, 208, 211, and 221);
  - scrolls its message list inside its own column, with the header above and the send box below always in view (ADR 0009, 130 and 198), and follows the newest message: opening a chat shows its last message; while the person is within 80 px of the end, every change keeps the view at the end; after the person scrolls up it stops, a "Jump to latest" button appears, and the button or sending a message returns to the end (ADR 0009, 199); a cost is a left-to-right run inside right-to-left text (ADR 0009, 197).
- **Custom components:** the conversation, the session list (`kvcoder.sessions`), the question card (`kvcoder.question`; one reply's approvals share one card, with "Allow all"), and the call card `kvcoder.call` (ADR 0011, 13): closed, it shows the call's description, then `connector · command` and the time, all starting at the card's inline start; a failed call has a danger-colored border and there is no exit chip; opened, it shows the payload (the line for `shell exec` and a binary's `exec`, its fields otherwise) and the output in dark blocks, with no block for an empty output; a call stored before `run` shows its command line as its one line; `http://127.0.0.1:<port>…` and `http://localhost:<port>…` URLs in any output are links that open in a new tab (ADR 0009, 120, 195, 196, 206, and 207).
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
| `kvcoder.connectors` | `[]` (binary connectors: `{ name, description, binary: { check, install?, help? } }`) |
| `kvcoder.sessions.keep` | 0 (keep all) |
| `kvcoder.welcome` | `null`: no welcome; a translation key (such as `kvcoder.welcome.default`) makes the welcome session (ADR 0009, 193) |

## 8.8 Documentation

kvcoder serves `kvcoder.docs.list` and `kvcoder.docs.get` (plan 09 §9.5): the pages `connectors` (the `run` tool, registering connectors, commands and binary connectors, help, examples, ownership and lifetime) and `sections` (global, workspace, and session sections, order, caps), as Markdown from its `docs/` folder (ADR 0010, 16).
