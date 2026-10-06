---
'@kvman/kvcoder': minor
---

The agent of a chat works as a lead engineer: it decides, clarifies, plans around the connectors and workers it has, runs independent work together, checks what workers return, and finishes when the work is ready for production. A worker's subagent gets its own shorter method: do the task, check it, return the result. The welcome is removed: the setting `kvcoder.welcome`, its session, and its texts are gone, and a session's title is always a string. `kvcoder.delegate.workers` is now in kvcoder's `Settings` type (ADR 0022, 1 to 4 and 9).
