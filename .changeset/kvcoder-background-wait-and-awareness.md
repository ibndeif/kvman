---
'@kvman/kvcoder': minor
---

Background runs the agent knows about and waits for: `background wait { id, timeoutMs? }` returns when a run ends or the time passes, `background output` takes `lines`, and `background list` returns short rows with `title` in place of `call`. A message the person sends while runs of the chat are running stores them as `content.running`, and the model is told after the message's text (ADR 0068).
