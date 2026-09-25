# ADR 0086 — Pending messages of a quarantined extension wait

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.7
- **Decided by**: the product owner

## Question

A quarantined extension is refused at admission (`HANDLER_UNAVAILABLE`, `03` §3.6), but the plan does not say what happens to its messages that are already pending.

## Options

1. **They stay pending and are not run** while the quarantine lasts.
2. They fail `HANDLER_UNAVAILABLE` at once.

## Decision

Option 1. The scheduler skips a quarantined extension's pending messages (queued, in lanes, waiting for a timer or a retry). They stay `pending` and run once the quarantine is lifted (`kernel.extension.unquarantine`, M2.7, or a rollback); their own deadlines still end them. Lanes they head stay blocked. Invocations already running finish normally.

## Consequences

`03` §3.6 states it.
