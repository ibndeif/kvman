# ADR 0057 — A mismatched idempotency key with onReply

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.4
- **Decided by**: the product owner

## Question

A send with `onReply` that fails `IDEMPOTENCY_MISMATCH` is stored as a failed command (ADR 0034), but that row cannot carry the same `(source, idempotencyKey)`, which is unique.

## Options

1. **Store the failed row without the key.**
2. Always reject the whole unit.

## Decision

Option 1: the failed command row is stored without an idempotency key, and its continuation receives the `IDEMPOTENCY_MISMATCH` reply as usual; the original message keeps the key.

## Consequences

`02` §2.7 states the rule.
