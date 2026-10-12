---
"@kvman/kvcoder": minor
---

An empty reply, or one cut at the model's length limit, no longer ends the turn as done: it gets one retry, then a clear `REPLY_INCOMPLETE` notice with Retry. Long files can be written in pieces with the new `fs part` and `fs assemble`. `fs read` can read on from where it was cut, also inside one very long line (`fromColumn`, `truncated`, `next`). `fs search` takes `literal` and `glob`, skips files Git ignores, and stops a slow expression after 2 seconds a file and 10 in all.
