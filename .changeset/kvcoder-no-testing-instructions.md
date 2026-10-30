---
'@kvman/kvcoder': patch
---

kvcoder's prompt no longer tells the agent to run, write, or skip tests: no `Testing:` question, no tests after each change or the whole suite at the end, and done no longer means "tests pass" (ADR 0111).
