---
'@kvman/kvcoder': patch
---

`kvcoder.job.list` and the `background list` connector read each job's row only, no longer a helper's messages, result, or progress, which only `kvcoder.job.get` returns; a chat with 19 helpers lists its jobs in 18 ms instead of 1.7 s, so the chat's polling no longer keeps a worker busy and delays the person's sends and answers.
