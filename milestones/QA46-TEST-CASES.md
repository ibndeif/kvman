# QA 46 — Fewer tokens in a chat, and a lighter conversation page (ADR 0034)

Asked: "you must fix all identified issues … review kvcoder and give suggessions for optimizations specially in minimizing token usage and user experience", then every suggestion, "but confirm that there is no any side effects".

## Happy path

- **QA46-H1 An edit shows what it changed.** *Given* a file of 40 lines, *when* `fs edit` replaces text on line 20, *then* the result has `fromLine: 17` and `content` with lines 17 to 23 as they now are. `extensions/kvcoder/test/edit-shows-change.test.ts`
- **QA46-H2 A second read of an unchanged file says so.** *Given* a chat where the model read `notes.txt`, *when* it reads the same lines again, *then* the second result is `notes.txt is unchanged since you read these lines earlier in this conversation; that result is above.` `extensions/kvcoder/test/read-unchanged.test.ts`
- **QA46-H3 The lead is told what a worker costs.** *Then* the lead's prompt has the sentence of ADR 0034, 3 in its Delegate step, and a subagent's prompt doesn't. `extensions/kvcoder/test/read-unchanged.test.ts`
- **QA46-H4 A command's JSON has no indentation.** *Then* an `fs list` result reaches the model as JSON on one line, and parses to the same value. `extensions/kvcoder/test/compact-results.test.ts`
- **QA46-H5 A search groups its matches by file.** *Given* two files with three matching lines, *then* `fs search` returns `{ files: [{ path, matches: [{ line, text }] }], truncated: false }`, with files in path order. `extensions/kvcoder/test/compact-results.test.ts`
- **QA46-H6 A tool result keeps its output once.** *Then* a stored `fs read` result has no `details.output` and still has its `details.connector` and `details.command`; a stored `shell exec` result keeps `details.output`, which has no exit-code line. `extensions/kvcoder/test/compact-results.test.ts`
- **QA46-H7 Only what is new is fetched.** *Given* a chat of two turns, *then* `kvcoder.message.list` with `afterSeq` of the first turn's last message returns only the second turn's messages, and with the newest `seq` returns none. `extensions/kvcoder/test/message-list-size.test.ts`
- **QA46-H8 The page adds what is new.** *Given* an open conversation, *when* a step ends, *then* the page asks `kvcoder.message.list` with `afterSeq` of its last stored message and shows the earlier messages with the new ones after them, once each. `extensions/kvcoder/test/web/conversation-incremental.test.ts`
- **QA46-H9 The context's size is answered.** *Given* a chat whose last call reported `input: 60000`, `cacheRead: 45000`, `output: 10`, *then* `kvcoder.context.get` gives `{ tokens: 105010, window: 128000, compactAt: 0.8 }`. `extensions/kvcoder/test/context-get.test.ts`
- **QA46-H10 The header shows the context line.** *Given* `{ tokens: 116285, window: 272000, compactAt: 0.8 }`, *then* the header has `Context 43% of 272K · summary at 80%`, and its Arabic text in Arabic. `extensions/kvcoder/test/web/context-line.test.ts`
- **QA46-H11 A card indents a JSON output.** *Then* a call card whose output is JSON on one line shows it indented by 2 spaces, and an output that isn't JSON as it is. `extensions/kvcoder/test/web/call-card.test.ts`

## Edge cases

- **QA46-E1 A changed file is read in full.** *Given* the chat of QA46-H2, *when* the file is edited and read again, *then* the result is the file's JSON; and a read of other lines of the unchanged file is also in full. `extensions/kvcoder/test/read-unchanged.test.ts`
- **QA46-E2 After a summary the file is read in full again.** *Given* a read that a summary covered, *then* the next read of the same lines returns the file's JSON. `extensions/kvcoder/test/read-unchanged.test.ts`
- **QA46-E3 An edit's lines are bounded.** *Then* an edit on line 1 starts at `fromLine: 1`; two edits 200 lines apart return 80 lines from 3 before the first; and the last changed line is counted in the edited file. `extensions/kvcoder/test/edit-shows-change.test.ts`
- **QA46-E4 An old result still shows.** *Then* a stored result with `details.output` shows that output; one with `details` and no `output` shows its text, ending with `[exit code 3]` when the text does; and one with no `details` shows its text without the exit-code line. `extensions/kvcoder/test/web/conversation-messages.test.ts`
- **QA46-E5 A gap loads the whole list.** *Given* an open conversation, *when* the messages returned after `afterSeq` don't start at the next `seq`, *then* the page asks again without `afterSeq` and shows that list. `extensions/kvcoder/test/web/conversation-incremental.test.ts`
- **QA46-E6 A model that isn't known has no window.** *Then* `kvcoder.context.get` gives `window: null`, and the header shows no context line. `extensions/kvcoder/test/context-get.test.ts` and `extensions/kvcoder/test/web/context-line.test.ts`
- **QA46-E7 A conversation that can't load.** *Given* `kvcoder.message.list` fails, *then* the page shows the chat's header, `This chat couldn't be loaded:` with the error's text, a Try again button that loads it again, and the Export button. `extensions/kvcoder/test/web/conversation-load-failure.test.ts`
- **QA46-E8 The minimum counts what is sent.** *Given* older messages whose stored content passes 10% of the window only because of their tool results' `details`, *then* they aren't summarized. `extensions/kvcoder/test/compaction-minimum.test.ts`
