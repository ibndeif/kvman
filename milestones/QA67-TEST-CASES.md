# QA 67 — a chat you can follow, tests you chose, and fewer slow steps (ADR 0102)

**Asked.** The owner asked for a review of kvcoder's harness and experience, said tasks take too long and that the
agent should ask before writing tests, then "fix all", that the chat must show what is going on rather than tool
calls, and "inspire from Claude Code but keep our architecture". Their answers are ADR 0102.

Paths are relative to `extensions/kvcoder/` unless they start with `extensions/` or `packages/`.

## Happy path

- **QA67-H1 headlines show.** *Given* three replies without text whose thinking is `**Reading the importer**`, the
  same, and `**Fixing the path check**`, each with one `fs` call, *then* the rows are the line `Reading the
  importer`, a fold of its two calls, the line `Fixing the path check`, and its one call card. `test/web/call-folds.test.ts`
- **QA67-H2 thinking no longer breaks a fold.** *Given* four call cards whose replies all have thinking without
  headlines, *then* they fold into one row. `test/web/call-folds.test.ts`
- **QA67-H3 the live line shows the newest headline.** *Given* a running step whose streamed thinking is
  `**Checking tests**\n\nI look…\n\n**Writing the fix**` and no call yet, *then* the activity line's title reads
  `Writing the fix`. `test/web/live-view.test.ts`
- **QA67-H4 the turn's time and the map step.** *Given* a running turn of 18 steps started 12 minutes ago, priced
  $0.84, and a map whose step `fix` (`Fix the importer`) is `doing`, *then* the line reads `Turn: 18 steps · 12 min ·
  about $0.84 · Step: Fix the importer`. `test/web/live-view.test.ts`
- **QA67-H5 the testing question.** *Then* the lead's engineering prompt holds the `Testing:` rule with its four
  options and `risky: false`, the proportion rule, and the 15-line Commands rule; a worker's holds its test rule and
  the smallest design. `test/unit/prompt-method.test.ts`
- **QA67-H6 "Decide for me" asks nothing about tests.** *Then* the lead's prompt with `decides` says to run the
  existing tests, leave the app running, and record nothing, and has no `ask choice` for tests.
  `test/unit/prompt-method.test.ts`
- **QA67-H7 helpers think at medium.** *Given* a chat at `xhigh` and a worker whose `thinking` is `null`, *when* it
  delegates, *then* the helper's level is `medium`; with the setting `low`, `low`. `test/delegate-default-model.test.ts`
- **QA67-H8 the slower mark.** *Given* a model with `low`, `medium`, `high`, and `xhigh`, *when* the thinking picker
  opens, *then* High and Extra high say "Slower and costlier" and Low and Medium don't. `test/web/thinking-picker.test.ts`
- **QA67-H9 a map with its details in one call.** *When* `execution-map set` gives two steps, one with `details`,
  *then* that step is detailed, the other is in `undetailed`, and `update` may mark the first `doing`.
  `test/map-details.test.ts`
- **QA67-H10 the map's entry names no worker.** *Then* the `execution-map` description doesn't contain `designer`,
  `architect`, `tester`, or `reviewer`, and says a bug fix or a change to one or two files gets no map.
  `test/unit/prompt-steps.test.ts`
- **QA67-H11 a call repaired.** *Given* `{ connector: 'shell', command: 'exec', payload: { line: 'ls' }, risky: false }`,
  *then* it parses as `shell exec { line: 'ls', risky: false }`. `test/unit/run-tool-arguments.test.ts`
- **QA67-H12 clearing past 80K.** *Given* a chat whose prompt measures 85,000 tokens and 30,000 tokens of clearable
  results, *when* a step starts, *then* results older than the newest 24,000 tokens are cleared.
  `test/clear-results.test.ts`
- **QA67-H13 Restart.** *Given* a running background process of a chat, *when* the person restarts it, *then* the old
  one is stopped with no background message, a new process runs the same line, and `{ id }` is the new one.
  `test/job-restart.test.ts`
- **QA67-H14 Run again.** *Given* an ended process, *when* the person runs it again, *then* a new process runs its
  line and no turn starts. `test/job-restart.test.ts`
- **QA67-H15 the popover's buttons.** *Then* a running process row has Restart, an ended one Run again, and a press
  runs `kvcoder.job.restart`; with every job ended the chip reads `Background (N)` and still opens the list. `test/web/jobs-chip.test.ts`
- **QA67-H16 a tool's near names.** *Given* a server with `browser_run_code_unsafe` and `browser_click`, *when* the
  model asks for `browser_run_code`, *then* the error says `Did you mean browser_run_code_unsafe?` before listing
  all. `test/unit/mcp-tool-names.test.ts`
- **QA67-H17 this turn's changes.** *Given* a chat that changed `a.ts` in its first turn and `b.ts` in its second,
  *when* the list is asked with `scope: 'turn'`, *then* it holds `b.ts` only, and with no scope both.
  `test/change-list.test.ts`
- **QA67-H18 the Changes switch.** *Then* the panel asks `scope: 'turn'` first and "Whole chat" asks `chat`.
  `test/web/changes-view.test.ts`
- **QA67-H19 the time limits.** *Then* the step registers `timeoutMs` 3,600,000 and `kvai.complete` 1,800,000.
  `test/unit/job-options.test.ts`, `extensions/kvai/test/complete-options.test.ts`
- **QA67-H20 continue queues for a working helper.** *Given* a background helper whose turn runs, *when* the lead
  calls `delegate continue` on it, *then* the call returns `queued for <id>…` with `(helper <id>)`, and the helper's
  next step holds the message. `test/delegate-continue.test.ts`
- **QA67-H21 a summary is retried.** *Given* a summary call that fails once with a temporary provider error, *when*
  the chat compacts, *then* it tries again and stores the summary. `test/compaction.test.ts`
- **QA67-H22 an invalid expression searched as text.** *When* `fs search { pattern: 'terminate(' }` runs in a file
  holding `terminate(1)`, *then* it finds that line and says it searched plain text. `test/fs-search.test.ts`
- **QA67-H23 filesOnly with context.** *Then* `fs search { filesOnly: true, context: 2 }` gives the counts.
  `test/fs-search-context.test.ts`
- **QA67-H24 a placeholder that reads.** *Given* a first message `we have this issue on production:` followed by a
  fenced JSON block, *then* the chat's title is `we have this issue on production` until the model titles it; a message
  starting with JSON and a stack line takes its first prose line; a long line is cut at a word within 60 characters.
  `test/titles.test.ts`
- **QA67-H25 a failed line reads calmly.** *Given* a shell line that exited 1, *then* its card has no danger border
  and no "Failed" chip, its closed line ends `exit 1`, and a fold holding it counts no failure.
  `test/web/call-card.test.ts`, `test/web/call-folds.test.ts`
- **QA67-H26 room for the chat.** *Then* the stylesheet makes the composer a container that shows the pickers' icons
  below 36 rem, and hides the chat list and shows the History button while the artifact panel is on the page.
  `test/web-styles.test.ts`

## Edge cases

- **QA67-E1 a headline inside text.** *Given* thinking `I think **this** matters`, *then* it has no headline.
  `test/web/call-folds.test.ts`
- **QA67-E2 a reply with text ends a run.** *Given* calls, then a reply with text, then calls, *then* the text is its
  own row between them, its thinking with it. `test/web/call-folds.test.ts`
- **QA67-E3 the first group may have no headline.** *Given* a run whose first replies have no headline, *then* its
  first group shows no headline line. `test/web/call-folds.test.ts`
- **QA67-E4 no headline in the live thinking.** *Then* the live line keeps "Thinking…". `test/web/live-view.test.ts`
- **QA67-E5 no map step doing, no cost.** *Then* the line has neither ` · Step:` nor a cost.
  `test/web/live-view.test.ts`
- **QA67-E6 the worker's own level wins.** *Given* a worker with `thinking: 'high'`, *then* its helper runs at
  `high`. `test/delegate-default-model.test.ts`
- **QA67-E7 a level the model hasn't.** *Given* a helper model with `off` only, *then* the helper's level is `off`.
  `test/delegate-default-model.test.ts`
- **QA67-E8 details kept when set again without them.** *Given* a detailed step, *when* the map is set again with it
  and no `details`, *then* it keeps them; with new `details`, they replace them. `test/map-details.test.ts`
- **QA67-E9 details over 4,000 characters** fail `VALIDATION_FAILED` and nothing is saved. `test/map-details.test.ts`
- **QA67-E10 a payload key isn't overwritten.** *Given* `risky: false` beside a payload holding `risky: true`, *then*
  the call fails as an unknown argument, and the payload keeps `true`. `test/unit/run-tool-arguments.test.ts`
- **QA67-E11 the shell line as the command.** *Given* `{ connector: 'shell', command: 'git status --short', payload:
  { risky: false } }`, *then* it is `exec` with that line; with a payload `line`, it stays and fails as an unknown
  command. `test/unit/run-tool-arguments.test.ts`
- **QA67-E12 a binary's args.** *Given* `{ connector: 'gh', command: 'pr list', payload: { risky: false } }` for a
  binary connector, *then* it is `exec { args: 'pr list' }`. `test/unit/run-tool-arguments.test.ts`
- **QA67-E13 functions. prefix.** *Given* `connector: 'functions.fs'`, *then* it is `fs`.
  `test/unit/run-tool-arguments.test.ts`
- **QA67-E14 under 80K no clear.** *Given* a prompt of 70,000 tokens, *then* nothing is cleared mid-turn.
  `test/clear-results.test.ts`
- **QA67-E15 little to clear.** *Given* a prompt of 90,000 tokens with 10,000 tokens clearable, *then* nothing is
  cleared. `test/clear-results.test.ts`
- **QA67-E16 after an idle hour.** *Given* a turn's first step after an hour, *then* results older than the newest
  24,000 tokens are cleared whatever the size. `test/clear-results.test.ts`
- **QA67-E17 restart refuses others.** *Then* a subagent's id fails `VALIDATION_FAILED`, an unknown id
  `kvcoder/JOB_NOT_FOUND`, and a call from an extension `NOT_PUBLIC`. `test/job-restart.test.ts`
- **QA67-E18 no near name.** *Given* `foo`, *then* the error lists the tools with no `Did you mean`.
  `test/unit/mcp-tool-names.test.ts`
- **QA67-E19 a chat with one turn.** *Then* `scope: 'turn'` lists all its files. `test/change-list.test.ts`
- **QA67-E20 continue to an ended helper** still waits for its answer, as before. `test/delegate-continue.test.ts`
- **QA67-E21 continue to a program worker's run** still fails `VALIDATION_FAILED`. `test/delegate-continue.test.ts`
- **QA67-E22 a summary that fails for good** after its tries adds `SUMMARY_FAILED` and the step goes on.
  `test/compaction.test.ts`
- **QA67-E23 literal stays literal.** *Given* `literal: true`, *then* no note is added. `test/fs-search.test.ts`
- **QA67-E24 no prose.** *Then* a message of code or JSON only keeps its first 60 characters. `test/titles.test.ts`
- **QA67-E25 a line that couldn't run** (denied, timed out, or invalid) keeps its failure look.
  `test/web/call-views.test.ts`
