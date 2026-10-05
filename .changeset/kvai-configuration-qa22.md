---
'@kvman/kvai': minor
---

kvai's configuration picks `kvai.defaultModel` from a searchable list (the new component `kvai.default-model`), saved into the scope the extension's page is set to. The "Change model" picker now behaves like the chat's: every word typed is searched, the current model is checked, and a count replaces the cap of 100 models (ADR 0015).
