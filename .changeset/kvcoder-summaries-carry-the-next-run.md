---
'@kvman/kvcoder': minor
---

A summary carries what the next run needs. Its instruction asks for the headings Request, State now, Next step, Decisions, Files, Commands that work, What failed, and Waiting on. kvman adds what it knows for certain to the stored summary, once, as `facts`: the person's own messages, the execution map, the files changed most recently, the background runs still running, and the artifacts; `person` carries the person's messages on to the next summary. `kvcoder.compactAt` is 0.6 by default (ADR 0066).
