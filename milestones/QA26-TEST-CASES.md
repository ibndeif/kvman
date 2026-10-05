# QA 26 — a running chat action shows its progress, and a summary has a minimum (ADR 0019)

Asked: "the slash command must show the progress while running", and "compacted must have a minimum limit to compact, to avoid multiple compactions". Decided in ADR 0019; plan 08 §8.1, §8.5, and §8.7. This file is the contract; every scenario's test name starts with its id.

## Happy path

- **QA26-H1 A slash command shows its line while it runs.** *Given* an open chat and a `kvcoder.session.compact` that hasn't answered, *when* the person runs `/compact`, *then* the chat shows `command-progress` with "Summarizing earlier messages…" and "0 s", "5 s" after five seconds, and no line once the command answers. `extensions/kvcoder/test/web/command-progress.test.ts`
- **QA26-H2 Every waiting action names itself, from the send box and from the menu.** *Then* `/export`, `/fork`, and `/rename x`, and the menu's Export, Fork, Summarize, and Rename, each show their own text while they run; `/new` and `/prompt` show no line. `extensions/kvcoder/test/web/command-progress.test.ts`
- **QA26-H3 While one runs, the box takes text and sends nothing.** *Then* Send is disabled, Enter keeps the text and sends no message, a second slash command doesn't run, and the menu's four items are disabled; after it ends the message can be sent. `extensions/kvcoder/test/web/command-progress.test.ts`
- **QA26-H4 A summary by hand says how it ended.** *Given* `{ summarized: true }`, *then* the toast is "Earlier messages were summarized"; *given* `{ summarized: false }`, *then* it is "Nothing to summarize yet: the messages before the last 10 are still short". `extensions/kvcoder/test/web/command-progress.test.ts`
- **QA26-H5 `kvcoder.session.compact` says whether a summary was made.** *Given* a chat whose older messages pass the minimum, *then* the answer is `{ summarized: true }` and a summary is stored; run again at once, *then* `{ summarized: false }` and no second summary. `extensions/kvcoder/test/compaction-minimum.test.ts`
- **QA26-H6 Older messages below the minimum aren't summarized.** *Given* 14 short messages and `kvcoder.compactAt` 0.0001, *when* a message is sent, *then* no model call summarizes, no summary is stored, and the model gets every message; by hand, `{ summarized: false }` and no model call. `extensions/kvcoder/test/compaction-minimum.test.ts`
- **QA26-H7 In the real app.** *Given* kvman in Chromium, a chat whose older messages pass the minimum, and a model that holds its answer, *when* the person types `/compact` and Enter, *then* the line "Summarizing earlier messages…" is on screen and Send is disabled; *when* the model answers, *then* the line is gone, the summary card shows, and the toast says the messages were summarized. `extensions/kvcoder/test/e2e/command-progress.test.ts`

## Edge cases

- **QA26-E1 A command that fails.** *Given* `kvcoder.session.compact` fails `kvcoder/SESSION_BUSY`, *then* the line goes away, the toast is the Problem only, and Send works again. `extensions/kvcoder/test/web/command-progress.test.ts`
- **QA26-E2 A summary that failed has its notice and no toast.** *Given* `{ summarized: false }` and a chat whose last message is the `SUMMARY_FAILED` notice, *then* no toast shows. `extensions/kvcoder/test/web/command-progress.test.ts`
- **QA26-E3 A waiting action from the prompt returns to the chat.** *Given* the prompt shown, *when* the person runs `/compact`, *then* the messages and the line show. `extensions/kvcoder/test/web/command-progress.test.ts`
- **QA26-E4 A failed summary by hand answers `false`.** *Given* a provider error, *then* the answer is `{ summarized: false }` and the chat has the `SUMMARY_FAILED` notice. `extensions/kvcoder/test/compaction-minimum.test.ts`
