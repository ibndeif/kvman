# ADR 0091 — Interrupted attempts at shutdown and after a crash

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.8
- **Decided by**: the product owner

## Question

Recovery sets `running` rows back to `pending (attempt+1)` (`03` §3.9), and shutdown leaves invocations still running after 10 s "for the next boot". The plan does not say:

- whether an attempt interrupted by a graceful shutdown counts;
- what happens when the count reaches `maxAttempts`.

## Options

1. **A crash counts; a shutdown does not.** A crashed row that reaches the maximum becomes dead.
2. Both count, and the message never becomes dead at boot.
3. Neither counts.

## Decision

Option 1:

- **Shutdown.** Rows aborted by a graceful shutdown return to `pending` without counting an attempt, because they did not fail. Their live events are reset.
- **Boot after a crash.** A row still `running` at boot was interrupted by a crash, so its attempts are incremented by one.
  - Below `maxAttempts`, the row becomes `pending`.
  - At `maxAttempts`, the row becomes `dead` with `MESSAGE_DEAD`, and `kernel.message.dead-lettered` is published (ADRs 0059, 0061, 0062). A message that crashes the daemon therefore cannot loop forever.

## Consequences

`03` §3.9 (Recover and Shutdown) is corrected.
