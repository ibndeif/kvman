---
'@kvman/kvcoder': patch
---

Deleting artifacts (ADR 0105). `kvcoder.artifact.delete` is a public command and the agent's `artifact delete { id }`: the agent deletes an artifact that is superseded or no longer true instead of emptying it, and a helper is refused. The artifact panel has a Delete icon that asks first; the person's delete tells the agent in one message from kvcoder, starting no turn. The setting `kvcoder.artifacts.keepDays` (0, keep all, by default; on the Chats card) makes the daily prune delete an idle chat's artifacts not updated within that many days, and tell the chat which.
