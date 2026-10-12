---
"@kvman/kvcoder": minor
---

Show Stop for every unfinished turn, also while it waits on a question, an approval, or a helper. `kvcoder.turn.cancel` takes an optional `turnId` and cancels only when that turn is still the current one, so a late Stop never ends a newer turn. The button reads "Stopping…" until confirmed, a failed stop says so above the send box, and the waiting hint says what Stop does. A step whose session ancestry is missing or cyclic again ends its turn instead of leaving the chat running.
