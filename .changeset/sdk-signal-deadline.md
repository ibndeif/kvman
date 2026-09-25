---
"@kvman/sdk": minor
---

`Ctx` gains `signal` (fires on cancel, deadline, or timeout; its reason is the ProblemError that ended the invocation) and `deadlineAt` (the invocation deadline).
