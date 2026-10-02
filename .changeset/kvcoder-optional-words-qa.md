---
'@kvman/kvcoder': minor
---

A shell call needs only its command: `title`, `description`, and `risky` are optional, so a model that leaves them out no longer has its call refused and re-sent whole. A call without `risky` counts as risky and asks the person first. When the input of an `ask`, `subagent`, `fs`, or `artifact` command is invalid, the error now also says what input the command takes, so the model fixes it at once instead of guessing field names again.
