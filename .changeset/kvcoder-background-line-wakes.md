---
'@kvman/kvcoder': patch
---

A background line wakes its chat when it ends by itself, so the agent goes on after a build or a test without a "Continue.": `notify` is true by default with `background`, and `notify: false` keeps a server quiet (ADR 0125).
