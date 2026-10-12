---
"@kvman/kvcoder": patch
---

Prevent short-lived shell calls, program workers and their installation checks from creating a process when already cancelled. Handle cancellation during process creation or abort-listener registration, wait for a created child to close, preserve cancellation reasons, and clean timers and listeners exactly once without changing normal output or timeout results.
