---
"@kvman/sdk": patch
---

Allow collection `find` to continue from an optional, exclusive `after` ID in either direction, including deleted or nonexistent cursor positions. Keep the required positive integer limit of at most 1000, ownership and filter semantics, Promise-based ordinary calls and synchronous transaction calls.

The kernel implementation is part of the coordinated root release; updated SDK types alone do not enable this option on an older kernel. Separate pages do not share a snapshot. No stored format or migration is added.
