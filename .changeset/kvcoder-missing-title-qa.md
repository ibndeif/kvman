---
'@kvman/kvcoder': patch
---

A shell call that leaves out its `title` now runs, with the first 60 characters of its `description` as the title, instead of failing and costing the model two or three retries. Any other invalid argument now says what the field must be.
