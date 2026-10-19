---
'@kvman/kvcoder': patch
---

`fs find { pattern, path? }` lists the files whose path matches a glob, newest first, at most 200, skipping what `fs search` skips; its card reads `Find <pattern> N files` (ADR 0090, 2).
