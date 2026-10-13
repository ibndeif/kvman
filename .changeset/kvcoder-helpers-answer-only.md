---
'@kvman/kvcoder': minor
---

A helper answers the lead only: it has no `ask` connector and of `artifact` only `get`, so it puts no question to the person and writes no artifact. Its answer has a fixed shape (Result, Evidence, Files changed, Unchecked, Questions), and the lead asks and shows what is worth it. Approvals of a helper's calls are unchanged (ADR 0063).
