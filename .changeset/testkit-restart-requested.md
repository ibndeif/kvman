---
'@kvman/testkit': minor
---

`TestKernel` gains `restartRequested()`, which resolves when `kernel.restart` is called on the running kernel (ADR 0024, 2). A test kernel doesn't restart by itself.
