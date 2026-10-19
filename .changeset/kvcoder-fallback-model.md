---
'@kvman/kvcoder': patch
---

`kvcoder.fallbackModel`: when a step's model reaches a usage limit, or a rate limit after all tries, the chat moves to the fallback, the notice `MODEL_SWITCHED` says so, and the step calls the model once more (ADR 0094, 4).
