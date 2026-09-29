# ADR 0005 — kvcoder

Status: accepted, 2026-09-29. Decided with the product owner in question rounds, after reviewing v2's agent, shell, interviewer, and builder designs on `archive/v2`.

1. **Role.** kvcoder is the app-building harness on kvai and kvwebui. Its main agent has one tool, `bash`; everything else goes through bash. Other extensions extend kvcoder by adding connectors, sections (rules, skills, …), and so on.
2. **Steps.** (The UI side is kvcoder's own conversation: ADR 0008, 23.) A turn runs as a chain of async jobs, one per step. A step that continues the turn queues the next with `execAsync` and sends the chunk `{ type: 'follow', jobId }`. kvwebui's chat handles that chunk like `kvman.follow(jobId)`, keeping one assistant bubble (ADR 0002, 33).
3. **Bash approval.** (Renamed `kvcoder.shell.approval`: ADR 0008, 36.) The setting `kvcoder.bash.approval` is `ask` (default) or `auto`. With `ask`, a real bash call becomes a confirm question (item 8) and the turn suspends. A denied call returns "denied by the user" to the model.
4. **Bash limits.** (PowerShell on Windows and tree kills: ADR 0008, 6 and 7.) `bash -lc <command>` in the workspace folder. The process group is killed on timeout (default 120 s; the model may ask for up to 600 s) or cancel. stdout and stderr are combined. Output over 30 KB keeps its first and last 15 KB around an explicit `[… N bytes omitted …]` marker. The result includes the exit code.
5. **Connectors.** (Superseded by 23.) A connector is a named group of commands, kvcoder's own concept; the kernel knows nothing about it.
   - **Registering.** `const fs = registerConnector(ctx, 'fs', 'Read and edit workspace files.')`, then `fs.registerCommand({ name: 'read', description, input, output, handle })`. That registers the ordinary public command `<namespace>.fs.read`, so sync and async behavior come from the kernel. It also adds the connector to the extension's `<namespace>.kvcoder.get` query.
   - **Where the helper lives.** In the kvcoder package's subpath `@kvman/kvcoder/registry`, which imports only the sdk. The import wall allows this one runtime import of another extension, when kvcoder is a `kvman.dependencies` entry.
   - **Binary connectors** describe a system binary (gh, a browser CLI), which the agent runs in real bash.
6. **Bash syntax.**
   - `<connector> <command> '<json input>'` (or the JSON as a heredoc on stdin). kvcoder runs it as the command itself, not in a shell, so the call must stand alone.
   - `<connector> -h` lists the connector's commands with one-line descriptions, and `<connector> <command> -h` prints the input and output JSON Schemas.
   - The result is the output as JSON text. A Problem prints `error <code>: <message>` with exit code 1.
   - The prompt lists each connector's name and description only.
7. **Async connector calls.** `--async` makes kvcoder queue its own job `kvcoder.connector.run`, which runs the command with `ctx.exec`, and prints `started <jobId>`. When that job ends, kvcoder appends the result to the session as a message, and starts a turn if the session is idle (otherwise the next step sees it). `jobs list` and `jobs cancel <id>` are built-in connector commands. Without `--async`, the call waits up to the command's own timeout.
8. **ask.** A built-in connector. The step records the question and suspends the turn, so no job runs. The chat shows the question card inline (a component chunk), and the session shows "waiting". The person's `kvcoder.question.answer` (user only) appends the answer as the bash result and queues the next step, which the card follows. A dismissal answers "dismissed by the user". kvinterviewer is removed: ADR 0004 and `plan/08-kvinterviewer.md` are superseded.
9. **subagent** is a connector as well (a built-in one).
10. **Sections.** (Superseded by 23.) `registerSection(ctx, { id, title, order, content: async ({ sessionId }) => string })`, from the same helper, adds a section to the extension's `<namespace>.kvcoder.get { sessionId }` answer.
    - At each step, kvcoder calls every such query in parallel with a 2 s timeout. One that fails or times out contributes nothing to that step and adds a notice.
    - Caps are 16 KB per section and 64 KB in total.
    - The prompt order is the base prompt, then the sections by `order`, then the connector index.
11. **Subagent.** `subagent run '{ "task", "mode": "fresh" | "fork", "connectors"?, "bash"? }'` runs a hidden child session with its own step chain.
    - The parent's turn suspends like `ask`; with `--async` it continues, and the answer arrives later as a message.
    - `fresh` gives the child the base prompt, the sections, and the task. `fork` gives it a copy of the parent's messages so far (plus its summary), then the task.
    - `connectors` is a subset of the parent's connectors (default: all). `subagent` is never included, so depth is 1, and `ask` is always included. `bash` (default true) allows real bash.
    - Several runs in one message run in parallel, and each child's final answer becomes its bash result.
    - A child's approvals and questions show in the root chat.
12. **Session API.**
    - `kvcoder.session.create { title? }` → `Session`
    - `kvcoder.session.list { limit }`: top-level sessions, newest first.
    - `kvcoder.session.get`, `.rename`, `.delete`.
    - `kvcoder.message.send { sessionId, text }` (user only): starts a turn when idle, or steers the next step when running.
    - `kvcoder.message.inject { sessionId, text }` (extensions): the same, marked as coming from that extension.
    - `kvcoder.message.list { sessionId, limit }`: pi-ai messages plus notices.
    - `kvcoder.turn.cancel { sessionId }`.
    - `kvcoder.question.answer { questionId, answer }` → `{ jobId }`.
    - `kvcoder.prompt.get { sessionId }`.

    `Session` is `{ id, title, status: idle | running | waiting, parentId?, model, usage, createdAt, updatedAt }`.
13. **Compaction.** Before each step, tokens are estimated (characters / 4) against the model's window.
    - Above `kvcoder.compactAt` (default 0.8), kvai summarizes the older messages, the last 10 are kept whole, and a summary message is stored. Older messages stay visible but aren't sent.
    - There's also a manual `kvcoder.session.compact`.
    - A failed summary adds a notice and the step goes on; `kvai/CONTEXT_TOO_LONG` then ends the turn.
14. **Cancel and restart.** (Interrupted steps now fail `INTERRUPTED` and end their turn through a `kernel.job.failed` handler: ADR 0008, 12.)
    - Cancel stops the running step, the children's turns, and pending questions (a later answer fails `kvcoder/QUESTION_NOT_FOUND`), adds a notice, and sets the session idle. `--async` connector jobs keep running and still report back.
    - Step jobs register `retries: 0`, so a step interrupted by a stop ends `failed` and the turn is marked interrupted with a notice. Suspended turns survive restarts.
15. **Binary connectors.** (Superseded by 23.) `registerBinary(ctx, { name, description, check, install? })` adds one to the extension's `<ns>.kvcoder.get`, and the setting `kvcoder.binaries` adds more (same shape). kvcoder runs each `check` once per session (at its first step, 5 s timeout) and lists only the ones that pass.
16. **ask syntax.** Answers become the bash result as JSON; a dismissal gives `{ "dismissed": true }`.
    - `ask text '{ prompt, placeholder? }'` → `{ text }`
    - `ask choice '{ prompt, multiple, options: [{ id, label, description? }] (2–10), other? }'` → `{ selected, other? }`
    - `ask confirm '{ prompt, danger? }'` → `{ confirmed }`
17. **UI.**
    - A Chat page `kvcoder.chat` (the coder preset's home): a session list with new-chat, and the `chat` component. There's also a `kvcoder.session` page with a `sessionId` param.
    - A status item with the count of waiting sessions.
    - Custom components: the question card and a bash-result card.
    - A Prompt tab showing `kvcoder.prompt.get`.
18. **Settings.** (`kvcoder.binaries` became `kvcoder.connectors` (23); `sessions.keep` defaults to 0 (ADR 0008, 32).)
    - `kvcoder.model`: default `kvai.defaultModel`.
    - `kvcoder.thinking`: default `medium`.
    - `kvcoder.maxSteps`: 50 per turn, then a notice and idle.
    - `kvcoder.bash.approval`: `ask`.
    - `kvcoder.compactAt`: 0.8.
    - `kvcoder.binaries`: `[]`.
    - `kvcoder.sessions.keep`: 100 top-level sessions per workspace; the oldest idle ones are deleted daily.

    The base prompt is English and tells the model to reply in `kernel.language` unless the person writes in another language.
19. **Developer-facing API** (Superseded by 23.) (supersedes the call shapes and discovery in 5, 10, and 15). The helper mirrors the SDK's `ctx.registerCommand(name, options)`:
    - `registerConnector(ctx, name, description)` → `connector.registerCommand(name, { description, input, output, handle, examples?, timeoutMs?, retries? })`.
    - `registerSection(ctx, id, { title, order, content: async ({ sessionId }) => string })`.
    - `registerBinary(ctx, name, { description, check, install? })`.
    - `examples?: [{ description, input }]` are printed by `-h` as ready-to-copy calls.
    - `runConnector(kernel, '<bash line>')` → `{ output, exitCode }` lets tests run a line exactly as kvcoder parses it, including `-h`.
20. **Command names.** (Superseded by 23.) A connector command is `<namespace>.<connector>.<command>`, collapsed to `<namespace>.<command>` when the connector's name equals the namespace. A clash fails at load like any duplicate.
21. **Discovery (internal to kvcoder).** (Superseded by 23.) The helper registers ordinary public queries next to the commands:
    - `<prefix>.help` per connector, which marks it and serves `-h`;
    - `<namespace>.section.<id>` per section → `{ title, order, content }`;
    - `<namespace>.binary.<name>` per binary → `{ description, check, install? }`.

    At each step kvcoder makes one `kernel.extensions.list` call to find them, calls the section queries (in parallel, 2 s timeout each, same caps), and runs binary checks at a session's first step, storing the results in the session record. Nothing about connectors is stored.
22. **Import path.** (Superseded by 23.) The helper is `@kvman/kvcoder/registry`, the general `<package>/registry` subpath (ADR 0001, 88). It replaces `@kvman/kvcoder/connector`.
23. **Connectors and sections by commands** (supersedes 5, 10, 15, and 19–22; `runConnector` stays).
    - kvcoder stores what other extensions register and reads only its own store during a turn.
    - `kvcoder.connector.register`: a **commands** connector `{ name, description, commands: [{ name, command, examples? }] }` runs the registering extension's own public commands through `ctx.exec`. A **binary** connector `{ name, description, binary: { check, install? } }` is run by the agent in real bash and listed only when its check passes (once per session, stored in the session record). A connector has exactly one of the two.
    - `kvcoder.connector.unregister { name }` and `kvcoder.connector.list`.
    - `kvcoder.section.set { id, title, order, content, sessionId? }`, `.remove`, and `.list`: pushed by the owner whenever its data changes; 16 KB each, 64 KB total.
    - **Ownership.** The caller owns what it registers, and a name owned by another extension fails with `kvcoder/NAME_TAKEN`.
    - **Lifetime.** Connectors last one run: kvcoder clears them in its `kernel.started` handler, and extensions register again in theirs. Sections are stored until removed. Entries of extensions that aren't loaded are ignored.
    - The setting `kvcoder.connectors` (replacing `kvcoder.binaries`) adds binary connectors from the preset or the person.
    - `runConnector` is exported from `@kvman/kvcoder/testing`.
24. **Message shape.** `{ id, sessionId, turnId?, seq, kind: 'user' | 'assistant' | 'toolResult' | 'notice' | 'summary', source?, content, model?, usage?, durationMs?, createdAt }`.
    - `source` is `{ kind: 'user' }`, `{ kind: 'extension', name }`, or `{ kind: 'subagent', sessionId }`.
    - `content` is a pi-ai message, a notice `{ code, params, text }`, or a summary `{ text, coversThroughSeq }`.
    - `usage` is `{ input, output, cacheRead, cacheWrite, cost }`.
    - `durationMs` is the model call's time for an assistant message, or the run time for a tool result.
25. **Totals.**
    - Each turn records `{ id, startedAt, endedAt, durationMs, steps, usage, outcome: 'done' | 'cancelled' | 'failed' | 'interrupted' | 'maxSteps' }`.
    - The session keeps running totals of `usage` and `durationMs`, and a subagent's usage is added to its parent's.
    - The chat shows each turn's time, tokens, and cost under its last answer, and the session's totals in its header.
26. **Long histories.** `kvcoder.message.list { sessionId, limit }` returns the newest `limit` messages in order, plus `omitted` (the number of older ones). The chat shows "N earlier messages" with export. No pagination.
27. **Turn state.** The turn record holds `pending: [{ toolCallId, kind: 'question' | 'subagent' | 'approval', questionId?, childSessionId? }]` and the tool results already produced in that step. When the last pending item resolves, kvcoder appends all results in the model's call order and queues the next step. It survives restarts.
28. **Scope.** Sessions exist only in their own workspace.
29. **Titles.** After the first turn ends, kvcoder asks `kvai.complete` (the session's model, no tools, `maxTokens` 30) for a 3–6 word title in the conversation's language. Until then, the title is the first 60 characters of the first message. `kvcoder.session.rename` overrides it, and a renamed session is never retitled. A failed title call keeps the placeholder.
30. **Export.** JSON only: `kvcoder.session.export { sessionId }` → `{ fileId }`, a kernel file `<title>.json` holding `{ session, turns, messages }` (subagent sessions included).
31. **Fork.** `kvcoder.session.fork { sessionId, throughSeq? }` → a new session with a copy of the messages (and the current summary) through `throughSeq` (default: all). Per-session sections aren't copied; their owners set them for the new session if they want to.
32. **Session access for extensions.** kvcoder's whole API is public, except `message.send` and `question.answer`, which are for the person only. Any extension may read every session's messages in its workspace.
33. **Session points.** `kvcoder.handler.register { point, command }` (the caller's own public command), `.unregister { point }`, and `.list`, registered from the extension's `kernel.started` handler. Handlers are cleared at each start and owned by the caller, like connectors. For each occurrence, kvcoder queues one async job per handler. Inputs carry ids and totals, never message contents:
    - `kvcoder.session.created { sessionId, parentId? }`
    - `kvcoder.session.deleted { sessionId }`
    - `kvcoder.session.forked { fromSessionId, toSessionId, throughSeq }`
    - `kvcoder.turn.started { sessionId, turnId }`
    - `kvcoder.turn.ended { sessionId, turnId, outcome, usage, durationMs }`
    - `kvcoder.session.waiting { sessionId, kind: 'question' | 'approval' | 'subagent' }`
34. **Loop safety.** A message injected by a job that kvcoder started as a handler (or by anything nested in it) is stored but doesn't start a turn. The next turn sees it.
