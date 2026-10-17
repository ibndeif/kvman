---
'@kvman/kvcoder': patch
---

`delegate continue { id, message, background? }` sends a follow-up to an ended subagent helper of the chat, which goes on with its own history instead of a new helper reading everything again; every helper result ends with the line `(helper <id>)` (ADR 0085, 4).
