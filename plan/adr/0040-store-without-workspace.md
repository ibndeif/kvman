# ADR 0040 — The workspace store without a workspace

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.2
- **Decided by**: the product owner

## Question

"A handler without a workspace (a global-scope type) may use only `ctx.store.global`" (`04` §4.3), without an error code. M1.1 had made the commit pipeline reject such a write with `VALIDATION_FAILED`, a choice the implementer made without asking.

## Options

1. `VALIDATION_FAILED`.
2. **`WORKSPACE_INVALID`**.
3. `CAPABILITY_DENIED`.

## Decision

`WORKSPACE_INVALID`: `ctx.store.kv`, `ctx.store.collection()`, and `ctx.store.log()` throw it at the call in a handler without a workspace (hint: use `ctx.store.global`), and the commit pipeline rejects a workspace-scope write from such an invocation with it too.

## Consequences

`04` §4.3 names the code; the M1.1 pipeline and its scenario change accordingly.
