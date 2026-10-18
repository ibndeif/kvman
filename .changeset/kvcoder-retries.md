---
'@kvman/kvcoder': patch
---

A failed model call is tried five times, after 1, 4, 15, and 60 seconds, and the activity line says why and after how long, such as "Retrying in 15 s: the provider is limiting calls (3 of 5)"; the `retry` chunk adds `waitMs` and `reason` (ADR 0087, 3 and 6).
