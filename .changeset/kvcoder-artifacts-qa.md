---
'@kvman/kvcoder': minor
---

The agent works like an expert: it understands from facts, resolves gaps and conflicts with `ask`, plans as the artifact `plan`, executes step by step, and delegates to specialist subagents. A new built-in `artifact` connector (`write`, `edit`, `get`) shows the person a Markdown or HTML document beside the chat, with the public queries `kvcoder.artifact.list` and `kvcoder.artifact.get`; the conversation gets an artifact card, a panel, and an `Artifacts (N)` button. An HTML artifact runs in a sandboxed frame with a policy that bars the network, forms, popups, and navigation.
