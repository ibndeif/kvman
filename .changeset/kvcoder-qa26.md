---
'@kvman/kvcoder': minor
---

A running chat action shows a line in the chat (what is running and for how long), from a slash command or the menu, and the send box neither sends nor runs a command meanwhile. `kvcoder.session.compact` answers `{ summarized: boolean }` in place of `{}`, and a summary by hand ends with a toast. The messages older than the last 10 are summarized only when they are at least 10% of the model's context window, by a step or by hand (ADR 0019).
