---
'@kvman/kvcoder': minor
---

The execution map: a new built-in connector, `execution-map` (`set`, `update`, `note`, `get`), is how the lead plans a task of several steps, and the person watches it as a diagram in the artifact panel, with the count in the header. A step runs only after the steps it waits on, is done only with evidence, and a finding the task doesn't need goes to "Noted for later". The public query `kvcoder.map.get` returns a chat's map. The `plan` artifact and its checklist are gone from the prompt. The lead's method has eight steps: it stays on its task, delegates less, shows UI in an artifact, spends context with care, and ends with what was done, checked, unchecked, still running, and noted (ADRs 0064 and 0065).
