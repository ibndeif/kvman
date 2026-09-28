---
"@kvman/sdk": minor
---

Add the LLM provider API (M2.9 slice A, 05 §5.11, ADR 0153): `ext.registerProvider` and `ext.registerModel` with the `ProviderDef` and `ModelDef` shapes, the read-only `ProviderContext` and `CompleteContext` (with `delta`), `ctx.llm` (`complete`, `countTokens`, `models`), and the `llmProblem` helper that builds the `Error` a provider throws to fail a call with an LLM code.
