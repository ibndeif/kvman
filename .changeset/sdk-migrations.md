---
"@kvman/sdk": minor
---

A migration's `m` gains `m.kv.each`, `m.collection(name).each`, and `m.log(name).each`, with `m.remove`, visiting the extension's data in every workspace and global. `compatibleWith` now lists newer data versions the code still runs on (M2.7).
