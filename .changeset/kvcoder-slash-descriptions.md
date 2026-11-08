---
'@kvman/kvcoder': patch
---

`kvcoder.slash.register` reads each command's description from `kernel.registrations.list` instead of converting every schema of the run, so registering slash commands at each start leaves far less garbage in a worker (ADR 0122).
