---
'@kvman/kvcoder': patch
---

A chat's steps and summaries ask for the provider's long prompt cache, so waits on the person, approvals, background runs, and helpers don't make the whole conversation be written to the cache again; a helper's steps and a title keep the default (ADR 0087, 4).
