---
'@kvman/kvcoder': minor
---

A turn has no step limit by default: `kvcoder.maxSteps` is now a positive whole number or `null`, and its default is `null` (it was 50). Set a number to cap a turn; it then ends with the "stopped after N steps" notice as before (ADR 0029).
