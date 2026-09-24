# ADR 0051 — What admission assigns in M1.4

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.4
- **Decided by**: the product owner

## Question

Admission step 2 (`03` §3.3) assigns priority, deadlines, and `notBefore`, but M1.5 lists priority defaults, inheritance, lowering, and timers, and M1.7 lists deadline inheritance. `03` §3.4 describes the pending index (per-lane queues, a keyless queue per handler, a timer wheel) under the scheduler.

## Options

1. **M1.4 assigns, later milestones act.**
2. Minimal M1.4: requested priority or `normal`, no `notBefore`; the rest in M1.5.

## Decision

Option 1:

- M1.4 assigns every field of step 2: priority defaults, inheritance, and lowering (`02` §2.6); `notBefore` from `delayMs` or `at`; the sender's explicit `deadlineAt`.
- M1.4 builds the pending index: per-lane queues in `seq` order, a keyless queue per handler, and a timer wheel for `notBefore`, fed after commit and rebuilt from SQLite.
- M1.5 builds selection, fairness, aging, limits, retries, and moving due timers into the queues; M1.7 adds deadline inheritance for `ctx.command`.

## Consequences

`15` §15.4 notes the split under M1.4 and M1.5.
