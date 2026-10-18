---
'@kvman/sdk': minor
---

`kvman.indexes` in an extension's manifest declares, per collection, the field sets it filters by (`storeIndexSchema`, `storeIndexesSchema`, `StoreIndexes`); the kernel builds them at start, and `find` and `count` use them, with the same results (ADR 0088, 3).
