---
"@kvman/sdk": minor
---

Add `ctx.process`: `spawn` returns a `ProcessHandle` (`processId`, `wait()`, `kill()`), and `kill(processId)` kills any live process the extension owns; with the `Processes`, `SpawnOptions`, `ProcessToken`, `ProcessResult`, and `ProcessExit` types (M2.6).
