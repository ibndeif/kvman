---
'@kvman/kvcoder': patch
---

Old tool results are sent cleared, as one line naming the call, when a turn starts after an hour without a model call or when the prompt is half full with much to clear; the newest 40,000 tokens of results are always kept, and the stored chat doesn't change (ADR 0094, 1).
