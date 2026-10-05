# ADR 0019 — A running chat action shows its progress, and a summary has a minimum

After ADR 0018 the product owner asked (2026-10-05): "the slash command must show the progress while running", and, while it was built, "compacted must have a minimum limit to compact, to avoid multiple compactions". A slash command emptied the send box and showed nothing until it ended, and a summary by hand takes a model call. A full chat was summarized again on every step, because anything older than the last 10 messages was summarized, even one message. Decisions 1 to 4, 7, and 8 were asked with alternatives.

## Decisions

1. **A running action shows a line in the chat** (asked; chosen over a line above the send box, and over the header). It is the running step's line, at the end of the messages: a spinner, what is running, and the seconds from the page's clock. The chat follows it like a new message. It goes away when the action ends, however it ends.
2. **Every action that waits for kvman shows it, from a slash command or from the menu** (asked; chosen over slash commands only, and over the summary only): `/compact` "Summarizing earlier messages…", `/export` "Exporting the chat…", `/fork` "Copying the chat into a new one…", `/rename` "Renaming the chat…", and the same four menu items. `/new`, `/prompt`, and Delete show none. One started while the prompt is shown returns to the chat, where the line is.
3. **While one runs, the send box takes text but neither sends nor runs a command** (asked; chosen over blocking nothing): Send is disabled, Enter does nothing and keeps the text, and the menu's four items are disabled. One action runs at a time.
4. **A summary by hand says how it ended** (asked; chosen over the summary card only): the success toast "Earlier messages were summarized", or "Nothing to summarize yet: the messages before the last 10 are still short". A summary that failed has its notice in the chat (`SUMMARY_FAILED`) and no toast.
5. **`kvcoder.session.compact` answers `{ summarized: boolean }`**, in place of `{}`: `true` when a summary message was stored; `false` when nothing was summarized or the summary failed.
6. **The menu's actions run where the slash commands run**: the header says what was picked and the conversation runs it, so the two share one state.
7. **A summary has a minimum, by size** (asked; chosen over 10 older messages, and over a setting): the messages older than the last 10 are summarized only when they are at least 10% of the model's context window (their stored content's characters / 4, as the threshold is measured). Smaller, they are kept whole and sent as they are.
8. **The minimum holds for a summary by hand too** (asked; chosen over automatic only): below it `kvcoder.session.compact` stores nothing and answers `{ summarized: false }`.
9. **A model kvai doesn't list has no window to measure**: as before, such a chat is never summarized automatically, and a summary by hand asks for a summary of whatever is older than the last 10. *(Not asked: this keeps what the code did.)*

## Plan corrections

Plan 08 §8.1 (compaction), §8.5 (`kvcoder.session.compact`), and §8.7 (the conversation).
