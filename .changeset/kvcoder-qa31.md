---
'@kvman/kvcoder': minor
---

The `delegate` connector replaces `subagent`: `delegate run { worker, task, background? }` hands a task to a worker, a subagent with its own instructions, connectors, model, and thinking. Workers are the new setting `kvcoder.delegate.workers`, which ships `general`, `ui-ux`, `architect`, `tester`, and `reviewer`; each is turned on, edited, added, or removed from the dialog that `delegate`'s cog opens. `mode` (`fork`) and the per-call `connectors` are gone, `Session` gains `worker?`, `delegate` is a name kvcoder owns and `subagent` no longer is. New error code: `kvcoder/WORKER_NOT_FOUND` (ADR 0021).
