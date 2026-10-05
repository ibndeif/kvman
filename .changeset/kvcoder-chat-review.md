---
'@kvman/kvcoder': minor
---

What a real chat showed (ADR 0012). The prompt lists the payload of every command of kvcoder's own connectors, as a signature such as `{ path, content, risky? }`, and an invalid payload returns its problems and that signature in place of the JSON Schema. A background start reports `[running]`, or that the process has already ended with its real exit code or the signal that killed it, and an exit inside its first second is no longer reported twice. `fs list` and `fs search` take an empty `path` as the workspace folder. Each model call carries the chat's id as `sessionId`, so the provider's prompt cache serves the calls of one chat. The prompt asks for one question per `ask` call, a plan only for a larger task, and a check before saying that something works.
