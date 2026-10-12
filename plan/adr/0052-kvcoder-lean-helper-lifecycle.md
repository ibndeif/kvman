# ADR 0052 — a lean helper lifecycle: no permits, one transaction for an end and its delivery, delete stops first

Status: accepted by the product owner by choice on 2026-10-12, before source. It replaces the mechanism of ADR 0045 for KVC-04, 05, and 06; ADR 0045's `sessions.deleting` field stays.

## Why

Probing the three boundaries on 2026-10-12 showed that the permit system of ADR 0045 is more than what is left to fix. A Stop that lands between creating a helper and starting it already starts no helper, foreground or background: the transaction that opens the helper's turn rereads its origin (ADR 0044). What still fails is a delete that leaves a background helper's step running, and a helper's end saved apart from the delivery of its result.

## Decisions

1. **No permit records.** The collection `delegate-starts` and the field `processes.cleanup` are removed; nothing wrote them. KVC-04 is closed by the existing origin check in the transaction that opens a helper's turn or launches a worker's run, with tests at that boundary.
2. **An end and its delivery are one transaction (KVC-06).** The transaction that ends a helper's turn also gives its result to the parent: the held result of the call that waits on it (and the parent's next step intent when it was the last), or the background message (and the parent's new turn when it is idle), or, for a helper whose step was interrupted, the end of the parent's turn. A worker run's end and its delivery are one transaction in the same way. Enqueueing, points, and cancelling stay after the commit. Ending twice delivers once, because the second end finds the turn ended. No receipt and no outbox.
3. **Delete stops first (KVC-05).** `kvcoder.session.delete` marks the session `deleting`, which already refuses new steps and grants under it, then cancels its turn and the turn of every session below it, foreground and background, stops their processes and worker runs, and only then deletes the records, a subtree at a time. A delete that was cut short is resumed by deleting again. A session's step intents, answer receipts, and send receipts are deleted with it.
4. **A turn that ends takes its helpers with it (KVC-05).** When a turn ends by anything but its own Stop while it still waits on helpers or worker runs, as when one helper's interrupted step ends its parent, the others are cancelled and the runs stopped. Stop already did this.
5. **Not covered.** A crash in the instant between creating a helper and starting it leaves the helper unstarted and its parent waiting; the person presses Stop (ADR 0049) or sends a message. A step job whose ownership can't be verified is logged and not cancelled, as before. Confirming that an operating-system process really exited is not added.

## Verification

Scenarios M2.4-E121 to E126, rewritten for this decision before source.
