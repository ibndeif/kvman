---
"@kvman/sdk": minor
---

`Ctx` gains `config` (`get()` returns schema defaults, then the global value, then the workspace's, by top-level field, with the handler's own pending sets; `set(scope, value)` is applied when the handler commits) and `secrets` (`get(name)` and `set(name, value | null)`, applied after the commit), with the `ConfigAccess` and `SecretAccess` interfaces.
