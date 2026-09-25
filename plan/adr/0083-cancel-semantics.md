# ADR 0083 — What a cancel ends, and when

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.7
- **Decided by**: the product owner

## Question

`02` §2.9 aborts a running invocation and "marks it cancelled if it was still pending or awaiting", without saying when a running message ends. It also says cancelling a completed message is a no-op, without saying what happens to unfinished messages that a finished one caused.

## Options

Running: **ended at once, result discarded**, or ended when it settles. Scope: **walk every descendant**, or stop the walk at finished messages.

## Decision

- The scope of `{ messageId }` is every descendant in the causation tree, walked through finished messages too. The scope of `{ correlationId }` is every message of the correlation.
- Every unfinished message in scope is cancelled: pending messages (timers included), running, awaiting, and queued transient deliveries.
- `{ cancelled: n }` counts them; it is 0 when nothing in scope is unfinished. The cancel command never cancels itself.
- All of this happens in the cancel's own unit:
  - each message is marked `cancelled` with the reply `CANCELLED`, its waiters are answered, and its continuation is sent;
  - a deferred command also sends its `onAbort { commandId, reason: 'cancelled' }`.
- After commit, each running invocation in scope gets `abort`. Its live events are reset, and whatever it returns later is discarded. Its worker slot stays busy until it settles, or until the 2 s grace makes the host stuck (ADR 0084).

## Consequences

`02` §2.9 is clarified.
