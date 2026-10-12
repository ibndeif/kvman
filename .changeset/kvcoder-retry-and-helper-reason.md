---
"@kvman/kvcoder": minor
---

Retry runs a stopped turn again without adding a "Continue" message: the new command `kvcoder.turn.retry` starts a turn on the history as it stands. A helper that fails or is cancelled now tells its parent why (the failure's code and the provider's reason), and marks its last message as unfinished rather than a result.
