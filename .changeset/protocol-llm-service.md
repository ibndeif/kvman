---
"@kvman/protocol": minor
---

Add the LLM service shapes (M2.9 slice A, ADRs 0152–0154): `ModelInfo`, the workspace and global `LlmDefaults`, the request and result schemas of `kernel.llm.providers.list`, `kernel.llm.models.list`, `kernel.llm.defaults.get`, `kernel.llm.defaults.set`, `kernel.llm.tokens.count`, `kernel.llm.usage.get`, and `kernel.llm.models.refresh`, the `kernel.llm.models.changed` and `kernel.llm.defaults.changed` event payloads, `ProviderStatus`, and the `ListedModel` a provider's `listModels` returns. The host frames gain the provider call path: `provide` (kernel to host) and `provider.delta` and `provided` (host to kernel).
