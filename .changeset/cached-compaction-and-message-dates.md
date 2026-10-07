---
'@kvman/kvcoder': minor
---

Following ADR 0032, a person's message reaches the model with the date and time it was sent, taken from its stored time so the provider's prompt cache still matches; a summary is asked for with the step's own request, so the older messages are read from the cache, and one with no text adds a `SUMMARY_FAILED` notice with `kvcoder/SUMMARY_EMPTY`; and the chat page no longer scrolls past a conversation that has an answered question.
