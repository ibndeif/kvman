---
'@kvman/sdk': patch
---

`registerCommand` takes `syncOnly`: a sync-only command can't be queued or scheduled, so its input (a secret, for example) never lands in a job row.
