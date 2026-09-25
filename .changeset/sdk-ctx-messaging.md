---
"@kvman/sdk": minor
---

`Ctx` gains the M1.6 members: `message`, `context`, `workspace`, `ids.new()`, `now()`, `command`, `send`, `query`, `publish`, `live`, `defer`, `reply`, `problem`, and `log`, with `SendOptions`, `CommandOptions`, `DeferOptions`, `Deferred`, `ProblemError`, `ProblemOptions`, `Logger`, `Workspace`, and the reference helpers `InputOf`, `OutputOf`, `PayloadOf`. A command handler may return `Deferred`.
