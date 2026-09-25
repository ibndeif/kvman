# ADR 0085 — The nested ctx.command depth limit

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.7
- **Decided by**: the product owner

## Question

`02` §2.13 limits nested `ctx.command` calls to a depth of 8 without a code; ADR 0072 deferred it to M1.7.

## Options

1. **`VALIDATION_FAILED`** with params.
2. A new kernel code.

## Decision

Option 1. The depth of an invocation is the number of callers above it that are waiting for it through `ctx.command`. A `ctx.command` from an invocation at depth 8 fails before anything is stored, with `VALIDATION_FAILED`, `params { limit: 'depth', max: 8 }`, and the hint "use a continuation (send with onReply)".

## Consequences

`02` §2.13 names the code.
