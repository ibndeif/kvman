# ADR 0102 — a chat you can follow, tests you chose, and fewer slow steps

Status: accepted by the product owner on 2026-10-25 ("fix all", then four rounds of questions; "inspire from Claude
Code but keep our architecture"). It amends plan 08 §8.1, §8.2, §8.3, §8.5, §8.6, and §8.7, plan 07 §7.1, and
ADRs 0064, 0086, 0093, 0094, and 0079.

## Context

A review of the owner's chats from 2026-10-15 to 2026-10-25 (`~/.kvman/kvman.db`, read only; gpt-6.1-sol and
gpt-6-luna, most at `xhigh`) found that tasks are slow because turns have many small steps, not because a step thinks
long:

- 155 top-level turns: 22 steps each on average, up to 419; the median step takes 11.5 s and resends about 100K
  tokens. A step takes 7.7 s at the median below 50K tokens and 13.7 s at 100–150K. Old results are cleared only past
  half of the 272K window, and a summary is made at 60% of it.
- 89.5% of replies with calls hold one call since ADR 0097, as before it.
- The lead spent 615 steps (3.1 h) only on the execution map, about as many as on writing code (631): `detail` takes
  one call per step, and a one-function production fix got a map, its details, and a confirmation.
- Tests were never asked about: 583 test-file writes, 415 test runs in the foreground (2.4 h), 95 in the background,
  stress tests of 9 minutes, and a project whose tests are as long as its source. The owner asked "why it takes so
  long?" twice, "stop testing", and "restart the app so I can test myself" about 12 times. The agent wrote a
  `Commands` section of 11 KB into `AGENTS.md`, with "after every change, run `npm test`".
- 242 steps with over 2,000 reasoning tokens took 7.4 h; helpers ran at the chat's `xhigh`.
- 99% of GPT replies carry a reasoning summary whose short bold headlines (`**Checking file replay errors**`) say
  what the step does, but the conversation hides them under "Thinking", and since a reply with thinking breaks a fold
  (ADR 0093, 1), each call shows as its own card: the chat reads as a list of tool calls.
- Bugs: the map's entry names a worker `designer` (the shipped one is `ui-ux`); `kvai.complete` has the kernel's
  10-minute default, so a long reply fails `TIMEOUT` and ends the turn; a step, which also runs its reply's calls,
  ends after 20 minutes; a summary call isn't retried (3 `SUMMARY_FAILED` with a temporary provider error);
  `delegate continue` to a helper still working fails (9 of 17); `fs search` refuses `context` with `filesOnly`, and
  `terminate(` as an invalid expression; about 40 calls failed on their arguments' shape (`risky` beside `payload`, a
  shell line as the command, a `functions.` prefix); a chat whose first turn waits keeps its raw first line as its
  title, such as "we have this issue on production: ```{"; a test run that fails while the agent fixes something shows as a red "Failed" card; with the artifact panel
  open the model and thinking pickers read "G." and "E", and the page shows four columns.

## Decision

1. **Step headlines** (asked; recommended over a progress call every few minutes and a `say` field on every call). A
   reply's headlines are the lines of its thinking that are wholly bold, `**<headline>**`, trimmed, in order. The
   conversation shows them; the model is asked nothing new, and nothing stored changes.
   - A reply with no text, whether or not it has thinking, no longer breaks a run of call cards (amends ADR 0093, 1).
   - A run is cut into groups at each reply whose last headline differs from the group's: a group is that headline
     as a line of its own (`kvc-headline`, `dir="auto"`), then its calls: two or more call cards fold into one row as
     before, and one shows as its card. Replies with no headline join the group before them; a run's first group may
     have no headline.
   - A reply's thinking stays readable: a headline line opens to show the thinking of the replies that share it, and
     a reply with no headline keeps its "Thinking" toggle, inside the fold with its call.
   - The running step's line shows the newest headline of the streaming thinking, in place of "Thinking…" or
     "Waiting for the model…", until the step's calls run; and, when the chat's map has a step `doing`, its title, and
     the turn's time so far, after its steps and cost: `Turn: 18 steps · 12 min · about $0.84 · Step: <title>`.
2. **Tests the person chose** (asked: an ordinary `ask choice` whose answer the agent records in `AGENTS.md`;
   recommended was a new `ask testing` command, and the other option a setting only). In the lead's engineering
   method:
   - Before it writes or changes a test, the lead looks for a line starting `Testing:` in the project's `AGENTS.md`.
     When there is none, it asks once, in the same round as its other questions, with `ask choice`, `multiple: true`:
     "Run the existing tests only", "Add unit tests", "Add end-to-end or browser tests", and "I'll test it myself: run
     the app for me", the existing tests first; then it records the answer as one line `Testing: <the choices, in
     plain words>` in `AGENTS.md` (created when missing), with `risky: false`, since the person just chose it. With
     "Decide for me" it asks nothing: it runs the existing tests and leaves the app running, and records nothing.
   - It follows the line: it writes only the kinds of tests it names, and with "I'll test it myself" it leaves the
     app running with its address and writes no tests.
   - Checks in proportion: after each change, the tests that cover it; the whole suite once, at the end; no stress,
     load, performance, or benchmark test unless the person asked for one.
   - The `Commands` section it may add to `AGENTS.md` holds only command lines, each with a few words of what it
     does, at most 15 lines; never notes, designs, or history.
   - "Ready for production" keeps its meaning, checked by the tests the person chose.
   - A worker's method says the same about tests: only the kinds the `Testing:` line names, focused ones, and no
     stress or benchmark test unless the task asks for it; and it proposes the smallest design that does the task.
3. **Helpers think at medium** (asked; recommended over an Auto level). The setting `kvcoder.delegate.thinking`,
   a level (default `medium`; no `null`, since Configuration would show it as "None"), is a subagent helper's level
   when its worker names none; the
   worker's own `thinking` still comes first, and the level is moved to one the model has (ADR 0087, 11). It is shown
   in Configuration's Agent card after `kvcoder.thinking`. The thinking picker marks High, Extra high, and Max
   "Slower and costlier".
4. **A lighter map** (asked; recommended over details in `set` only, and a to-do list). `execution-map set`'s steps
   take `details?` (Markdown, 1 to 4,000 characters), saved with the step, so a map is set with its details in one
   call; a step left without keeps the details it had (ADR 0086, 1). `detail` stays, to change one step. The entry
   says to set the details with the map, and the method and the entry say a bug fix, and a change to one or two
   files, never get a map. The entry no longer names workers: it says to use a worker whose description in the
   `delegate` entry fits.
5. **Calls repaired, not refused** (asked; keep `run`, recommended was native tools behind a setting). Before a
   call's arguments are checked: a key beside `connector`, `command`, and `payload` moves into the payload when the
   payload doesn't have it; a `connector` that starts with `functions.` loses it; and for `shell`, or a binary
   connector, a `command` that isn't one of its commands nor `help` becomes `exec` with that text as `line` (`args`
   for a binary) when the payload has none. What is still wrong fails as before.
6. **Clearing that keeps the cache** (the owner asked for the option that benefits from the provider's cache; this
   replaces ADR 0094, 1's half of the window). Old tool results are cleared at a turn's first step after an hour
   with no model call, as before, when the cache has expired anyway; and at any step only when the prompt passes
   80,000 tokens (half the model's window when that is less) and 20,000 tokens of results could be cleared. A clear keeps the newest 24,000 tokens of results,
   so the next one comes many steps later and every step between reads the cache. Summaries are unchanged.
7. **Run again and Restart** (asked; recommended over a workspace App command). In the chat's Running popover, a
   running process has Restart and an ended one Run again: `kvcoder.job.restart { sessionId, id }` (user only) stops
   the process when it runs, without a background message, and starts its line again in the chat as a new
   background process, with no turn; it returns `{ id }`, the new process's id. Its end is reported as any
   background run's. So that an ended process can be run again, the Running chip stays once every job has ended,
   as a quiet `Background (N)` that opens the same list. A subagent's or a program worker's id fails `VALIDATION_FAILED`; an id the chat didn't start,
   `kvcoder/JOB_NOT_FOUND`.
8. **MCP** (asked; recommended over a connection kept per chat). One call stays one connection. A tool not found
   names first the server's tools whose names start with, contain, or are contained in the asked name (at most 5),
   as `Did you mean …?`, then all of them; the `mcp` entry says that a browser server's several actions go in one
   `mcp run`, since each call starts the server again.
9. **The Changes view shows this turn** (asked; recommended over since the last commit). `kvcoder.change.list` takes
   `scope?: 'turn' | 'chat'` (`chat` when left out): with `turn`, only files whose latest change was made in the chat's
   latest turn: a `file-changes` record keeps that turn as `turnId` (`null` in records made before). The panel shows `turn` first, with a switch "This turn | Whole chat"; the
   header's count stays the whole chat's.
10. **Time limits** (asked: a call 30 min, a step 1 h; recommended was 60 min and 2 h). `kvai.complete` registers
    `timeoutMs` 1,800,000 (plan 07 §7.1); a stream silent for 300 s is still aborted (ADR 0096). A step job's
    `timeoutMs` is 3,600,000.
11. **A message to a working helper waits for it** (asked; recommended). `delegate continue` to a subagent helper of
    the chat whose turn hasn't ended queues the message for it, as a person's message steers a running chat, and
    returns at once `queued for <id>: it reads this at its next step, and its answer comes as a background message`
    with the line `(helper <id>)`, whatever `background` says. The check refuses it no more.
12. **A summary is retried.** A summary's model call is tried again as a step's is (ADR 0087, 3), with the same
    `retry` chunks.
13. **`fs search` forgives.** `filesOnly` with `context` ignores `context`. A `pattern` that isn't a valid
    expression is searched as plain text, and the result adds `note: "The pattern isn't a regular expression
    (<reason>), so it was searched as plain text."`.
14. **A placeholder that reads** (asked; recommended over a model title at the first turn's start, whose call would run
    beside the first step). Until the model writes the title after the first turn, as before, a chat's placeholder is
    the first line of prose of the person's first message: fenced code blocks are left out, and so are lines that
    start as JSON, markup, a quote, code, or a stack or log line (`{ } [ ] < > " ' \``, `at `, a date, `#!`); its end
    loses trailing spaces and `: ; , -`, and it is cut at a word within 60 characters (at 60 when no word ends past
    30). A message with no such line keeps its first 60 characters.
15. **A failed line reads calmly.** A `shell exec` or binary `exec` that ran and exited with a code other than 0 has
    no danger border and no "Failed" chip: its closed line ends with `exit <N>` in the muted color, and a fold
    doesn't count it as failed (amends ADR 0079, 1). Its result for the model is unchanged.
16. **Room for the chat.** The composer is a container of its own, and below 36 rem of its width its pickers and
    "Decide for me" show their icons (ADR 0093, 3, which also still holds). While the artifact panel is open, the
    chat list is hidden and the History button opens it, as below 60 rem of page width.

Not done (asked): native tools per command; a hint or a new chat for long chats; an MCP connection kept between
calls.
