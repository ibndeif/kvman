# QA 71 — workers in the background, focused briefs, and a lighter history (ADR 0108)

**Asked.** The owner said kvcoder takes too long, its workers run long while the lead neither steers them nor tells
the person, the chat reads badly, the agent loses focus, and connector help calls shouldn't show. After a review of
their chats they answered six rounds of questions; the answers are ADR 0108. They accepted its details as written.

Paths are relative to `extensions/kvcoder/` unless they start with `extensions/` or `packages/`.

## Happy path

- **QA71-H1 a run returns at once.** *Given* a chat with the worker `general`, *when* the agent calls `delegate run`
  with `kind: 'find'`, *then* the result is `started <id>` and `(helper <id>)`, the turn's next step runs, and the
  session never waits on the helper. `test/delegate-background-only.test.ts`
- **QA71-H2 the answer wakes the lead.** *Given* the lead's turn ended while its helper runs, *when* the helper ends
  `done`, *then* its answer is appended as a background message and a turn starts. `test/delegate-background-only.test.ts`
- **QA71-H3 the person's message reaches the lead.** *Given* a running helper and an idle lead, *when* the person
  sends a message, *then* a lead turn starts at once with it, and the helper goes on. `test/delegate-background-only.test.ts`
- **QA71-H4 Stop leaves helpers running.** *Given* a lead turn running with a helper started in it, *when* the person
  presses Stop, *then* the lead's turn ends `cancelled`, the helper's session still runs, and the Running popover
  lists it with Stop. `test/delegate-background-only.test.ts`
- **QA71-H5 a program worker's run returns at once.** *Given* an `opencode` worker with `approval: 'auto'`, *when* the
  agent delegates to it, *then* the result is `started <runId>` and its result arrives as a message with
  `source: { kind: 'job' }`. `test/delegate-runs.test.ts`
- **QA71-H6 the brief is written from its fields.** *Given* `kind: 'change'`, `goal`, `done`, `files:
  ['src/a.ts']`, and `context: [{ path: 'src/a.ts', fromLine: 10, lines: 5 }]`, *then* the helper's first message
  holds `Kind: change`, `Goal: …`, `Done when: …`, `You may change only: src/a.ts`, the shell line, and `## Context`
  with lines 10–14 numbered. `test/delegate-brief.test.ts`
- **QA71-H7 context past 20 KB is named.** *Given* ranges whose text passes 20 KB, *then* the ranges that fit are
  attached in order, and the next is named `<path> lines <a>–<b> · not attached (over 20 KB)`. `test/delegate-brief.test.ts`
- **QA71-H8 a find run is read-only.** *Given* a `find` run, *when* its helper calls `fs write`, *then* the call is
  refused as a read-only helper's, before any approval. `test/delegate-brief-enforce.test.ts`
- **QA71-H9 a change run stays in its files.** *Given* a `change` run with `files: ['src/a.ts']`, *when* its helper
  edits `src/a.ts` and then `src/b.ts`, *then* the first runs and the second fails `VALIDATION_FAILED` `This run may
  change only: src/a.ts.` before any approval. `test/delegate-brief-enforce.test.ts`
- **QA71-H10 the budget ends a run.** *Given* `budget: 3`, *when* the helper's fourth step would start, *then* its
  turn ends `maxSteps` and the lead's background message is the unfinished result with its last message.
  `test/delegate-budget.test.ts`
- **QA71-H11 the thinking ceiling.** *Given* a worker at `max` and `kvcoder.delegate.thinkingLimit` `high`, *when* it
  is delegated to, *then* the helper's level is `high`; with the limit `medium`, `medium`. `test/delegate-default-model.test.ts`
- **QA71-H12 the delegate rule in the prompt.** *Then* the lead's engineering method says to delegate `find`,
  `check`, and `review` runs, `change` runs only in parallel on files that don't overlap, never a question, a small
  change, held context, or work asked of the lead, and never to `background wait` on a helper. `test/unit/prompt-method.test.ts`
- **QA71-H13 a trim at 60K.** *Given* a chat of three ended `done` turns and a running one, whose prompt measures
  62,000 tokens, *when* a step starts, *then* `collapsedThroughSeq` moves to the end of the second turn, the first
  two are sent as their person's messages and one answer each, the third and the running turn whole, and no summary
  is made. `test/history-trim.test.ts`, `test/unit/history-collapse.test.ts`
- **QA71-H14 a collapsed turn names its files.** *Given* a collapsed turn that changed `src/a.ts`, *then* its answer
  ends with `[kvman: files changed in this turn: src/a.ts]`. `test/history-trim.test.ts`
- **QA71-H15 a trim after an hour.** *Given* a chat at 30,000 tokens whose last model call is 61 minutes old, *when*
  a turn's first step starts, *then* it trims. `test/history-trim.test.ts`
- **QA71-H16 steps between trims keep the prefix.** *Given* a trim and then three steps under 60,000 tokens, *then*
  each step's messages start with the previous step's unchanged (`sent.prefixKept: true`). `test/history-trim.test.ts`
- **QA71-H17 rule files one level down.** *Given* `research/AGENTS.md` and no root `AGENTS.md`, *then* the first
  step's prompt holds the section `Project rules: research/AGENTS.md`, and `.hidden/AGENTS.md` and
  `node_modules/x/AGENTS.md` aren't read. `test/project-rules.test.ts`
- **QA71-H18 a changed rule file is a message.** *Given* a chat whose kept `AGENTS.md` the agent then edits, *when*
  the next step starts, *then* its system prompt is the same as before and one message `[kvman: AGENTS.md changed
  since this chat started. Its current text:]` is appended, once. `test/project-rules.test.ts`
- **QA71-H19 no duplicate finished message.** *Given* a background process the agent waited for with `background
  wait` until it ended, *then* no background message for it is appended. `test/background-wait-message.test.ts`
- **QA71-H20 tool lists stay.** *Given* an `mcp tools` result older than the newest 24,000 tokens, *when* a trim
  runs, *then* it is sent in full. `test/history-trim.test.ts`
- **QA71-H21 what was sent is recorded.** *Then* each assistant message has `sent` with `promptHash`,
  `messagesHash`, `messageCount`, and `prefixKept`, and none of the prompt's text. `test/history-trim.test.ts`
- **QA71-H22 the two new rules.** *Then* the lead's method holds the "test it themselves" rule and the map-update rule,
  and the Deliberate part runs only when the person asks. `test/unit/prompt-method.test.ts`
- **QA71-H23 a check-in at step 60.** *Given* a turn reaching step 60, *then* the message `[kvman: step 60 of this
  turn. Say in one line where you are and what is left, then go on.]` is appended before the call, and again at
  120. `test/turn-check-in.test.ts`
- **QA71-H24 one MCP session a turn.** *Given* a command MCP server with a `port`, *when* a turn calls it three times,
  *then* it is started once, through `ctx.processes`, the calls share its state, and the turn's end stops it; a server
  over HTTP keeps its MCP session for the turn the same way. `test/mcp-turn-connection.test.ts`
- **QA71-H25 housekeeping hidden.** *Given* a turn with `fs read`, `help`, `mcp tools`, `background wait`, and
  `execution-map update` calls, *then* the conversation shows the `fs read` card only, and a fold counts only it.
  `test/web/call-folds.test.ts`
- **QA71-H26 registered connectors have signatures.** *Given* a registered connector with a command whose input
  schema is `{ name, limit? }`, *then* its index entry is one line per command with `{ name, limit? }`, `help` last.
  `test/unit/prompt-build.test.ts`
- **QA71-H27 an invalid payload carries its help.** *When* a call's payload fails its schema, *then* the error ends
  with the command's `help` text. `test/connector-help.test.ts`
- **QA71-H28 waiting for the connection.** *Given* a model call that fails `kvai/PROVIDER_ERROR` `transient: true` five
  times, then succeeds, *then* the turn gets `CONNECTION_WAITING` once, waits, and goes on at the schedule's next run,
  with a fake clock. `test/connection-waiting.test.ts`
- **QA71-H29 notify wakes the chat.** *Given* `shell exec` with `background: true, notify: true` and an idle chat,
  *when* the process exits, *then* its message starts a turn; the same line without `notify` starts none.
  `test/background-notices.test.ts`
- **QA71-H30 the worker card says where it is.** *Given* a running helper whose newest thinking headline is
  `**Reading the importer**`, at step 12 of 60, after 3 minutes, whose last call read `src/a.ts`, *then* its card
  shows the headline, `step 12 of 60`, `3 min`, and the call's closed line. `test/web/subagent-card.test.ts`
- **QA71-H31 a url artifact replaces an ended one.** *Given* 20 artifacts, the oldest `url` one served by a stopped
  process, *when* the agent writes a new `url` artifact, *then* it replaces that one. `test/artifact-connector.test.ts`
- **QA71-H33 the server form takes a port.** *Given* a command server's draft with the port `8931`, *then* the saved entry
  has `port: 8931`, and a port of `80` is refused under its field, as the setting refuses it.
  `test/web/mcp-server-form.test.ts`
- **QA71-H32 run with a calls list.** *Given* `run { calls: [fs read a, fs read b, fs edit c] }`, *then* the reply is
  stored as three `run` calls with ids `<id>-1` to `<id>-3`, each with its own result, and the history sends them so.
  `test/run-calls-list.test.ts`, `test/unit/run-tool-arguments.test.ts`

## Edge cases

- **QA71-E1 `background` is refused.** `delegate run { …, background: true }` fails `VALIDATION_FAILED` for the
  unknown key. `test/delegate-brief.test.ts`
- **QA71-E2 an old foreground wait settles.** *Given* a turn saved before ADR 0108 waiting on a pending `subagent`
  call, *when* the helper ends, *then* its answer resolves the call as before. `test/unit/old-records.test.ts`
- **QA71-E3 files for a non-change kind.** `kind: 'review'` with `files` fails `VALIDATION_FAILED`.
  `test/delegate-brief.test.ts`
- **QA71-E4 change without files.** `kind: 'change'` without `files` fails `VALIDATION_FAILED`. `test/delegate-brief.test.ts`
- **QA71-E5 field limits.** `goal` or `done` empty or over 300 characters, `files` empty or over 50 or with a glob,
  `context` empty or over 20, `budget` 0 or 61, each fail `VALIDATION_FAILED` naming the field. `test/delegate-brief.test.ts`
- **QA71-E6 a path outside the workspace.** A `files` or `context` path that leaves the workspace folder fails
  `VALIDATION_FAILED`. `test/delegate-brief.test.ts`
- **QA71-E7 a missing context file.** A `context` range whose file doesn't exist is attached as `<path> · error
  NOT_FOUND: …`, and the run starts. `test/delegate-brief.test.ts`
- **QA71-E8 a read-only worker refuses change.** `kind: 'change'` to `reviewer` fails `VALIDATION_FAILED` from
  `kvcoder.delegate.check`. `test/delegate-brief-enforce.test.ts`
- **QA71-E9 every changing fs command is held to files.** `fs undo`, `fs part`, and `fs assemble` on a path outside
  `files` are refused as `fs edit` is. `test/delegate-brief-enforce.test.ts`
- **QA71-E10 a continued helper's budget.** *Given* a helper that ended at its budget of 3, *when* the lead continues
  it, *then* its new turn may take 3 steps more. `test/delegate-budget.test.ts`
- **QA71-E11 the ceiling meets the model.** *Given* the limit `high` and a model whose levels are `low` and `medium`,
  *then* the helper thinks at `medium`. `test/delegate-default-model.test.ts`
- **QA71-E12 a Continue chain stays whole.** *Given* ended turns `done`, `failed`, `cancelled`, then a running turn
  over 60,000 tokens, *then* only turns up to and including the `done` one may collapse, and the newest ended turn
  never does. `test/history-trim.test.ts`
- **QA71-E13 a trim with nothing to collapse.** *Given* one ended turn and a running one over 60,000 tokens, *then*
  results are cleared and no turn is collapsed. `test/history-trim.test.ts`
- **QA71-E14 the window is small.** *Given* a model whose window is 100,000 tokens, *then* the trim runs past 50,000.
  `test/history-trim.test.ts`
- **QA71-E15 the summary still saves an overflow.** *Given* a trim that leaves the prompt above `kvcoder.compactAt`,
  *when* the next step starts, *then* it summarizes as before. `test/history-trim.test.ts`
- **QA71-E16 old records.** A session with no `collapsedThroughSeq` or `rules`, and an assistant message with no
  `sent`, read as before. `test/unit/old-records.test.ts`
- **QA71-E17 a rule file removed.** *Given* a kept `AGENTS.md` that is then deleted, *then* the message says it
  changed and gives no text, once. `test/project-rules.test.ts`
- **QA71-E18 a rule file past 32 KB.** It keeps its first 32 KB with the line that says the rest was left out.
  `test/project-rules.test.ts`
- **QA71-E19 a helper keeps its parent's rules.** *Given* a parent's kept rules and a later edit, *when* a helper is
  created, *then* its prompt holds the parent's kept text. `test/project-rules.test.ts`
- **QA71-E20 output records nothing.** *Given* `background output` while the process still ran, *when* it ends,
  *then* its finished message is appended. `test/background-wait-message.test.ts`
- **QA71-E21 a person's message during the wait.** *Given* `CONNECTION_WAITING`, *when* the person sends a message,
  *then* the step runs at once with it. `test/connection-waiting.test.ts`
- **QA71-E22 Stop during the wait.** *Given* `CONNECTION_WAITING`, *when* the person presses Stop, *then* the turn ends
  `cancelled` and the scheduled try then does nothing. `test/connection-waiting.test.ts`
- **QA71-E23 the tries run out.** *Given* failures for 30 scheduled tries, *then* the turn ends `failed` with
  `STEP_FAILED`. `test/connection-waiting-ends.test.ts`
- **QA71-E24 any other failure ends at once.** A failure that isn't temporary ends the turn as before, with no wait.
  `test/connection-waiting-ends.test.ts`
- **QA71-E25 notify needs background.** `notify: true` without `background: true` fails `VALIDATION_FAILED`.
  `test/background-notices.test.ts`
- **QA71-E26 notify while a turn runs.** *Given* a running turn, *when* a `notify` process ends, *then* its message is
  queued for the next step and starts no second turn. `test/background-notices.test.ts`
- **QA71-E27 an MCP server that dies mid-turn.** *Given* a turn's server whose process exits, *when* the next call
  comes, *then* it connects again. `test/mcp-turn-connection.test.ts`
- **QA71-E28 Stop closes MCP connections.** A turn that ends by Stop, failure, or step limit stops its servers' process
  trees, on Linux, macOS, and Windows. `test/mcp-turn-connection.test.ts`
- **QA71-E29 a helper's own connections.** A helper and its lead calling the same server use two connections.
  `test/mcp-turn-connection.test.ts`
- **QA71-E30 no ended url artifact.** *Given* 20 artifacts whose `url` ones are all still served, *then* a new `url`
  artifact fails `TOO_LARGE`; a `markdown` one always does at the limit. `test/artifact-connector.test.ts`
- **QA71-E31 a calls list with a bad entry.** `run { calls: [fs read a, { connector: 'nope' }] }` runs none and fails
  `VALIDATION_FAILED` naming entry 2. `test/run-calls-list.test.ts`
- **QA71-E32 a calls list of 21.** Fails `VALIDATION_FAILED`; an empty list too. `test/run-calls-list.test.ts`
- **QA71-E33 a calls list with approvals.** *Given* `calls: [fs edit risky, fs read b]`, *then* the edit asks, the read
  runs, and the order of ADR 0046 holds when the answer comes. `test/run-calls-list.test.ts`
- **QA71-E34 both shapes at once.** `run { connector, command, calls }` fails `VALIDATION_FAILED`. `test/unit/run-tool-arguments.test.ts`
- **QA71-E35 hidden calls that fail.** A failed `help` or `background wait` is hidden too, and a fold doesn't count its
  failure. `test/web/call-folds.test.ts`
- **QA71-E36 the check-in in a helper.** A helper's turn gets no check-in message. `test/turn-check-in.test.ts`
- **QA71-E37 a worker card after the budget.** A helper that ended at its budget shows `step 60 of 60` and its
  outcome. `test/web/subagent-card.test.ts`
- **QA71-E38 the shipped workers.** *Then* the six shipped workers' levels are unchanged by ADR 0108; only the ceiling
  caps them. `test/unit/shipped-workers.test.ts`
