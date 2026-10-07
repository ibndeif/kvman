# ADR 0036 — A call's card reads as what the call did, a finished background job's time, the artifact titles, and a summary that keeps a call with its results

Status: accepted, 2026-10-07. It changes plan 08 §8.1 and §8.7, ADR 0020, 1, and ADR 0011, 13, ADR 0009, 195 and 207, ADR 0034, 4, and ADR 0035, 7 where they differ.

The product owner pasted an opened card of an `fs edit` on an Arabic prompt file: the payload and the output as two blocks of indented JSON, and asked to "optimize the user experience" of "all tool call types", taking inspiration from pi, opencode, and Claude Code. In that card a line break showed as `\n`, Arabic text ran left to right, the file's text showed twice, and fields meant for the model (`risky`, `firstChangedLine`) stood beside it. Those three agents each render a call by its kind, with a fallback for the rest, and their closed line says what was done to what.

Everything a view needs is in the stored call and its result, so only kvcoder's web code changes: no stored shape, no command, and nothing the model is sent.

Decisions 1, 2, 4, 5, 12, and 14 were asked with mockups. The others are the smallest way to carry them out, and the product owner may overrule any of them.

## Decisions

1. **Each kind of call has its own view** (asked; chosen over showing every payload as readable fields only). The kinds are `fs edit`, `fs write`, `fs read`, `fs list`, `fs search`, a line (`shell exec` and a binary's `exec`), `mcp call`, and `delegate run`. Every other call, of kvcoder's own connectors or a registered one, has the fields view (decision 9). `ask` and `artifact write` and `edit` keep their cards (ADR 0013, 1; ADR 0009, 177).
2. **Closed, a card's second line says what was done, to what, and the outcome** (asked; chosen over keeping `connector · command` with the subject after it, and over leaving the closed card as it was). It replaces `connector · command` for the calls below; any other call keeps `connector · command`. The first line is still the call's description, and a call stored before `run` still shows its command line. The subject is in the monospace font, left to right, as is an outcome of numbers and signs alone (`+A −R`). The outcome comes from the result, so a pending or failed call has none.

   | Call | Words | Subject | Outcome |
   |---|---|---|---|
   | `fs edit` | Edit | the path | `+A −R`: the added and removed lines of its diffs (decision 4) |
   | `fs write` | Write | the path | `Created · {size}` or `Replaced · {size}` |
   | `fs read` | Read | the path | `Lines {from}–{to} of {total}` |
   | `fs list` | List | the path, `.` when it has none | `{count} entries` |
   | `fs search` | Search | the pattern | `{matches} matches in {files} files` |
   | a line | none | `$ ` then the line, cut as today (ADR 0009, 195) | none |
   | `mcp call` | none | `{server} · {tool}` | none |
   | `mcp tools` | Tools | the server, then ` · {tool}` when one is named | `{count} tools` for a list |
   | `delegate run` | Delegate | the worker | none |
   | `background list` | Background runs | none | `{count} runs` |
   | `background output` | Output | the id | none |
   | `background stop` | Stop | the id | none |
   | `artifact get` | Read artifact | the id | none |

   - A size is `{n} bytes` under 1024, then `{n} KB` and `{n} MB` with one decimal, in the page's language.
   - A list or a search that was cut (`truncated`) says `the first` before its count: `The first 1000 entries`, `The first 200 matches in 12 files`.
   - A call with `risky: true` has the chip "Risky". The "Background" and "Failed" chips and the time stay.
3. **Opened, a card shows the time's two parts, then the call's view.**
   - `fs edit`: one diff per edit (decision 4), then `{count} replacements · from line {line}` from the result.
   - `fs write`: the content as numbered lines from 1.
   - `fs read`: the result's content as numbered lines from its `fromLine`.
   - `fs list`: a row per entry: a folder or file icon, the name, and a file's size.
   - `fs search`: per file, its path, then its matches as numbered lines with each match's line number.
   - a line: `$ ` then the whole line, then the output, as before.
   - `mcp call`: the `arguments` as fields (decision 9), then the tool's text.
   - `delegate run`: the task as text, then the answer as Markdown.
   - `risky`, `timeoutMs`, and `background` are never shown as fields of these eight; the chips say the first and the last.
4. **An edit's diff trims the lines its two texts share** (asked; chosen over a longest-common-subsequence diff in kvcoder, and over the `diff` package). `oldText` and `newText` are split at line breaks; a text's last line break ends its last line and adds no empty one. The lines both have at the start, and then at the end, are context, and at most 3 of them show on each side, the nearest to the change. What is left of `oldText` shows as removed lines (`−`, danger color), then what is left of `newText` as added lines (`+`, success color). An edit that changes scattered lines therefore shows everything between its first and last changed line.
5. **A change and a failure are open without a click** (asked; chosen over opening only failures, and over all closed). A card of a successful `fs edit` or `fs write`, and any failed call's card, starts open; every other card starts closed. A press on its row opens or closes any card.
6. **A failed call shows its error first.** A failed call that isn't a line shows the result's text in danger color, then the call's view of its payload. A failed line shows its line and its output as before: its output is what failed.
7. **A long block shows its first 12 lines.** A diff, numbered lines, a text field, and a list of more than 12 lines or rows show 12, then the button `Show all {count} lines`; pressed, the whole block shows and the button reads `Show fewer`. The block no longer has its own vertical scroll. **An output shows its end too** (asked for after the first version: "show the first 12 line and some dots then latest 5 lines"): a line's output, and any other output shown as text, of more than 17 lines shows its first 12, a line of dots (`⋯`), and its last 5, where a failed command says why.
8. **Text reads in its own direction.** Each line of a diff, of numbered lines, and of a text field is `dir="auto"`, so an Arabic line starts at the right and a line of code at the left. Line numbers and the `+` and `−` marks stay at the left in every page language, as in an editor. A line's output keeps one direction for the block, as before.
9. **The fields view never shows escaped JSON.** A payload, and an output that is a JSON object or array, show as rows of name and value:
   - a string on one line, a number, or a boolean beside its name; `null` as a dash;
   - a string of several lines as a text block under its name (decisions 7 and 8);
   - an array whose items are all objects of scalars as a table, with a column per field name in first-seen order;
   - an array of scalars as one item per line; an empty array or object as a dash;
   - any other object or array as nested rows.
   An output that is an array shows as such an array with no name. Any other output shows as text, as before. A call with an empty payload shows no payload rows.
10. **Local links stay links** (ADR 0009, 120) in a line's output, a text output, and every text the fields view shows.
11. **The activity line is unchanged.** While the model writes a call its payload isn't in yet, so the running step still names the call by its description and `connector · command`.
12. **The approval card shows the same view** (asked; chosen over keeping its one-line subject). Each approval shows the call's description, the closed line of decision 2 in place of `connector · command` and the subject, and the call's view of its payload under them (the diff of an `fs edit`, the content of an `fs write`, the arguments of an `mcp call`, the task of a `delegate run`; a line has only its closed line, whole). Decision 7 folds it.
13. **The custom component `kvcoder.call`** takes `{ description?, connector?, command?, payload?, line?, failed?, durationMs?, output? }`: the call as the `run` tool takes it (`payload` is its object), or `line` alone for a command line. Its `label` and its string `payload` are gone; nothing used them outside kvcoder.
14. **A finished background job's card shows how long it ran** (asked, after the product owner added "the completed background tools should also show the elapsed time"; chosen over storing `durationMs` on the message's `source`, and over adding it to the text the model reads). The card finds its run in the chat's job list (`kvcoder.job.list`) by the message's `source`: `jobId`, or `sessionId` for a subagent. When the run is there and has ended, the end minus the start shows at the end of the card's row, in the unit that fits (ADR 0017, 2). The list holds a chat's newest 50 runs, so the card of an older run shows no time.
15. **An artifact's title in the panel's row of titles stays on one line.** The product owner sent a picture of the panel's header in an Arabic chat with five artifacts: each title was squeezed to one word per line, four lines high, over a sideways scrollbar. The titles shared the row's width and wrapped. Each title now keeps its own width on one line, cut with an ellipsis past 14 rem with the whole title as its tooltip; the row scrolls sideways when the titles don't fit, with a thin scrollbar, and the shown artifact's title is scrolled into view when the panel opens and when the shown artifact changes.
16. **A summary never ends between a reply's calls and their results.** The product owner reported a turn that stopped on `OpenAI API error (400): No tool call found for function call output with call_id call_IxK9…`, and every retry stopped the same way. The chat's database showed why: a reply at seq 386 made five calls, whose results are seq 387 to 391, and the summary made next covers through seq 387. The step then sent the results 388 to 391 with no call before them. A summary kept the newest `kvcoder.compactKeep` messages by count alone, so its end fell wherever the count did. Now, when the first kept message would be a tool result, the kept messages start at the reply that made its call: a reply and its results are kept or summarized together, and more than `kvcoder.compactKeep` messages may stay whole. Chosen over summarizing the results too, which would hide results the model has just read.
17. **A history that starts at a tool result starts at the reply that made its call.** This repairs a chat whose summary was stored before decision 16, with nothing rewritten: when the first message after the latest summary is a tool result, the step also sends the reply that made its call and that reply's earlier results, though the summary covers them. Compaction's count, `kvcoder.context.get`, and the next summary read the same history.
