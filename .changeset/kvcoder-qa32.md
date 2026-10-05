---
'@kvman/kvcoder': minor
---

A worker of the `delegate` connector can run a program on this computer: its `kind` may be `opencode`, `pi`, or `claude`, each with `approval`, `timeoutMs`, and its own flags. A run is the private async job `kvcoder.delegate.worker.run`; the turn waits on the new pending kind `worker` (`runId`), and `kvcoder.job.*`, `background`, and `kvcoder.session.waiting` gain the kind `worker`. New public command `kvcoder.delegate.worker.check { name }` → `{ status: 'ready' | 'notFound' }`; a session's `checks` gain `worker:<name>` (ADR 0021, 31 to 38).
