# ADR 0069 — Transient events reach subscribers as unstored deliveries

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.6
- **Decided by**: the product owner

## Question

`02` §2.5 says transient events reach subscriber handlers and SSE clients (memory only, at-most-once), but `03` §3.3 step 7 says "transient event (at commit) → live bus only".

## Options

1. **Unstored deliveries** through the scheduler (lanes, limits, priority), never retried.
2. Direct to the subscriber's host like queries.
3. SSE clients only.

## Decision

Option 1. After the publishing unit commits, each granted subscriber of a transient event gets an in-memory delivery with its own id, handled by the scheduler like a durable delivery (its lane, handler and extension limits, priority, fairness) but with no row. It is never retried: a failed, conflicting, or lost attempt drops it, and a restart forgets it. Its unit of work commits normally. The live bus also carries the event to SSE clients (M1.8).

## Consequences

`03` §3.3 step 7 and `02` §2.5 are corrected.
