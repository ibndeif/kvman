# ADR 0054 — A caller lane or a kernel context key is refused

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.4
- **Decided by**: the product owner

## Question

`02` §2.2 lets callers supply a lane "only when the handler does not declare one" and says a handler "cannot remove kernel-set keys" of the context, without saying what happens otherwise.

## Options

1. **`VALIDATION_FAILED`** for both.
2. Ignore the caller's value.

## Decision

Option 1: a caller lane for a handler that declares a lane template fails `VALIDATION_FAILED` ("this handler declares its lane"), and a context addition that changes a kernel-set key (`locale`) fails `VALIDATION_FAILED`. New keys, and new values for inherited keys the kernel did not set, are allowed.

## Consequences

`02` §2.2 states both rules.
