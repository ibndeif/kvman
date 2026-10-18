# QA 57 — A conversation that reads like a colleague (ADR 0089)

**Asked.** The product owner found that a kvcoder chat reads like a procedure, not like a colleague who works alongside
them as Claude Code does, and asked whether the tool descriptions cause it. In the owner's busiest chat, 922 of 1,065
replies held only calls, every call carried a formal caption, the map and its confirmation ran for every task, and
questions came one reply each.

**The owner chose:** `run` without `description` (the call names itself); the lead narrates briefly between calls; a
map, and its confirmation, only for work that changes several dependent parts or is hard to take back; every question
in the same reply, with the `ask` connector unchanged.

Paths are relative to the repository root.

## Happy path

- **QA57-H1 `run` takes three arguments.** *Then* the `run` tool's schema has the properties `connector`, `command`,
  and `payload`, requires `connector` and `command`, and its example has no `description`; the base prompt says
  `as { connector, command, payload }` and has no sentence about a description.
  `extensions/kvcoder/test/unit/run-tool-arguments.test.ts`
- **QA57-H2 a call card's title is its own line.** *Given* calls of `artifact write`, `artifact edit`, and `help` with no
  description, *then* their closed line is `Write artifact <id>`, `Edit artifact <id>`, and `Help <connector> <command>`
  (`Help <connector>` without a command), in English and Arabic. `extensions/kvcoder/test/web/call-summary.test.ts`
- **QA57-H3 an approval holds the call without a description.** *Given* a risky shell call, *when* it waits for the
  person, *then* the turn's pending approval is `{ connector, command, payload }`. `extensions/kvcoder/test/questions.test.ts`
- **QA57-H4 a background process is titled by its line.** *Given* a background `shell exec`, *then* its row's `title`
  and `call` are the line (the title cut at 80 characters), and the person's next message carries
  `<id> (process): <line>`. `extensions/kvcoder/test/background-wait.test.ts`, `extensions/kvcoder/test/background-aware.test.ts`
- **QA57-H5 a helper's run is named by its title.** *Given* a background `delegate run` titled `Node.js expert`, *then*
  the job list's `title` and `call` are both `Node.js expert`. `extensions/kvcoder/test/delegate-runs.test.ts`,
  `extensions/kvcoder/test/background-connector.test.ts`
- **QA57-H6 a helper's progress names its calls.** *Given* a background helper that listed `.`, searched `hello`, and
  waits on the approval of `echo hi`, *then* its `recentCalls` are `fs list .`, `fs search hello`, and
  `shell exec echo hi`, and its `waitingFor` is `shell exec echo hi`. `extensions/kvcoder/test/background-waiting.test.ts`
- **QA57-H7 the model is sent past calls without a description.** *Given* a stored reply whose `run` call holds a
  `description`, *when* the next step calls the model, *then* that call's arguments are sent without it and the
  stored message keeps it. `extensions/kvcoder/test/stored-description.test.ts`
- **QA57-H8 the lead narrates its work.** *Then* the lead's method says to say, between calls, in a sentence or two in
  the reply that makes the next call, what it found and what it does now, not to announce routine calls, and its last
  rule no longer says "Say what you are about to do in the same reply"; a worker's method has neither.
  `extensions/kvcoder/test/unit/prompt-method.test.ts`
- **QA57-H9 a map only for large or risky work.** *Then* the lead's method says that work that changes several parts
  that depend on each other, or is hard to take back, needs a map, that other work, even of a few steps, needs none,
  and that it plans only when its path needs a map. `extensions/kvcoder/test/unit/prompt-build.test.ts`
- **QA57-H10 every question in the same reply.** *Then* the lead's Clarify rule and the general method say every
  question goes in the same reply, one `ask` call each, never one question per reply.
  `extensions/kvcoder/test/unit/prompt-build.test.ts`

## Edge cases

- **QA57-E1 a call that still sends `description` fails.** *Given* a `run` call with a `description`, *then* it fails
  `VALIDATION_FAILED` with a message that names `description`, and runs nothing. `extensions/kvcoder/test/stored-description.test.ts`
- **QA57-E2 a stored approval or held call with a description still parses.** *Given* a stored call
  `{ description, connector, command, payload }`, *then* it parses as it is, a call without one parses, and a call with
  any other extra field still fails.
  `extensions/kvcoder/test/unit/call-name.test.ts`
- **QA57-E3 each kind of call is named.** *Then* `callName` gives `shell exec <line>`, `<binary> exec <binary> <args>`,
  `fs read <path>`, `fs search <pattern>`, `delegate run <worker> · <title>`, `mcp run <server> · <tool>, <tool>`,
  `mcp call <server> · <tool>`, `help` with its command, `<connector> <command> <id>`, and `<connector> <command>` for a
  call with no subject. `extensions/kvcoder/test/unit/call-name.test.ts`
- **QA57-E4 a long or multi-line call is named on one line.** *Given* a shell line of several lines and 300
  characters, *then* its name is one line of 200 characters and `…`. `extensions/kvcoder/test/unit/call-name.test.ts`
- **QA57-E5 an old call keeps its caption on screen.** *Given* a stored call with a `description`, *then* its card
  still shows the description above its closed line. `extensions/kvcoder/test/web/call-card.test.ts`
