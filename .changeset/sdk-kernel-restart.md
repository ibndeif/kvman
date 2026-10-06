---
'@kvman/sdk': minor
---

`kernelCommandSchemas` gains `kernel.restart` (`{}` → `{ restarting: true }`), and `healthSchema` gains the optional `rolledBack`, the Problem of the start that was undone before this one (ADR 0024, 2 and 6).
