---
'@kvman/kvai': patch
---

Each model call logs its model, the time to its stream's first event, and its longest gap between events, with no payload, so a cut-off for a silent stream can be chosen from real use (ADR 0094, 2).
