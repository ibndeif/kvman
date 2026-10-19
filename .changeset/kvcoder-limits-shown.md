---
'@kvman/kvcoder': patch
---

`background wait`'s `timeoutMs`, `background output`'s `lines`, `fs read`'s `lines`, and `fs search`'s `context` are cut into their range instead of refused, and a payload signature shows a string's maximum length as `name (≤N)` (ADR 0090, 4).
