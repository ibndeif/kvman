---
'@kvman/kvcoder': patch
---

A helper starts with its parent's check results, less the program workers', and never runs a program worker's check, since it can't delegate; a helper stored without checks runs only the binary connectors' (ADR 0087, 10).
