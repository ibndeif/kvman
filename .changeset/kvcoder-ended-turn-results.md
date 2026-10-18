---
'@kvman/kvcoder': patch
---

A turn that ends while its last reply's calls wait or run now stores a result for each of them, so the model is never sent a call without one: a held result as it was, `not run: <why>` for a call that never started, and `stopped while it ran (<why>): what it changed is unknown, so check before you run it again` for one that was running (ADR 0087, 1).
