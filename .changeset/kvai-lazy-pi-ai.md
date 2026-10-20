---
'@kvman/kvai': patch
---

pi-ai loads with a worker's first model call or model list, not when kvai loads, as ADR 0009, 52 intended: idle memory with the coder preset falls from about 307 to 238 MB.
