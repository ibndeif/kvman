---
'@kvman/kvcoder': patch
---

A background helper waiting on the person's approval or answer has the status `waiting`, and `background output`, `background wait`, and `kvcoder.job.get` say how far a helper got (`progress`) and what it waits on (`waitingFor`); `wait` ends as soon as a helper waits, and the Running chip shows it as "Waiting for you" (ADR 0085, 2).
