# ADR 0155 — `ctx.llm.models()` needs no `llm` capability

- **Status**: accepted
- **Date**: 2026-09-28
- **Milestone**: M2.9
- **Decided by**: the product owner

## Question

The plan disagreed:

- `03` §3.8 opens `kernel.llm.models.list` to any caller;
- `05` §5.4 and §5.7 list `ctx.llm.models()` under the `llm` capability.

`ctx.llm.models()` is that query, so gating the wrapper would protect nothing.

## Options

1. **The wrapper is allowed without `llm`, like the query.**
2. The query requires `llm` for extension callers.

## Decision

Option 1.

- `ctx.llm.models()` works without `llm`.
- `llm` guards `ctx.llm.complete` and `ctx.llm.countTokens`, which reach a provider.

## Consequences

- `05` §5.4 and §5.7 say so.
- Scenario M2.9-E8 checks only `complete` and `countTokens`.
