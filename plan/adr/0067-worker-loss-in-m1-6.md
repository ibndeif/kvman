# ADR 0067 — A worker that exits, before supervision

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.6
- **Decided by**: the product owner

## Question

M1.6's Done-when needs "an attempt that publishes live events and then crashes" to be reset before its retry, but host crash handling is M1.7 (`03` §3.6).

## Options

1. **An uncaught exception** is the crash in M1.6; M1.7 adds worker loss.
2. **Minimal worker loss** in M1.6: a worker that exits fails its running attempts; restart policy, stuck detection, and quarantine stay in M1.7.

And for the pool: start a fresh worker lazily on the next need, or leave the pool smaller until M1.7.

## Decision

Option 2, with lazy replacement:

- When a shared worker exits, each attempt running on it has its live events reset (`02` §2.3) and then fails as a retryable `INTERNAL` problem, counted as an attempt (retries and dead letters of `03` §3.4). Queries waiting on it fail `INTERNAL`; `ctx.command` and `ctx.query` calls it made are abandoned.
- The pool drops the worker and starts a new one on the next dispatch that needs it, up to the pool size.
- An uncaught exception in a handler is also a crash of that attempt: `INTERNAL`, retryable, with its live events reset.
- M1.7 adds redelivery without penalty for collateral work, stuck detection, and quarantine. (A "restart backoff" was named here first; the plan has none, and ADR 0082 keeps lazy replacement without one.)

## Consequences

`15` M1.6 notes the split.
