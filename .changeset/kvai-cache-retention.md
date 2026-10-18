---
'@kvman/kvai': patch
---

`kvai.complete` takes `cacheRetention?: 'short' | 'long'` and passes it to pi-ai, which uses the provider's longer prompt cache for `long` where the model has one (ADR 0087, 4).
