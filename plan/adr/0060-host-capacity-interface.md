# ADR 0060 — The scheduler's host interface before M1.6

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.5
- **Decided by**: the product owner

## Question

Execution hosts arrive in M1.6, but M1.5 enforces the per-host in-flight cap (64 per worker) and the share reserved for queries (25%, `03` §3.4). How does the scheduler dispatch and learn host capacity?

## Options

1. **A host interface**: the scheduler dispatches through a typed interface that names the host of a message and reports its in-flight count and cap.
2. The scheduler counts in-flight invocations itself per `(extension, isolation)` key.

## Decision

Option 1. The scheduler dispatches through a `Dispatcher` interface: for a message about to be claimed it asks which host runs it and that host's `{ inFlight, cap }`, and hands over the claimed message. The scheduler enforces the split itself: commands and event deliveries may fill at most 75% of a host's cap (rounded down); queries may use all of it. M1.5 tests pass an in-memory dispatcher, as grants are passed as data (ADR 0052); M1.6's shared pool implements it.

## Consequences

`03` §3.4 states the split. M1.6 implements `Dispatcher` without changing the scheduler.
