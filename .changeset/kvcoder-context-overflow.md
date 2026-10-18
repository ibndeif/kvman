---
'@kvman/kvcoder': patch
---

A model call that fails `kvai/CONTEXT_TOO_LONG` now gets a summary by force and one more call before the turn fails, which also covers a chat whose model's window is unknown; compaction's count gives each image 1,600 tokens (ADR 0087, 2).
