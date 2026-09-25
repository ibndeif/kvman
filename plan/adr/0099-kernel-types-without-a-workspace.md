# ADR 0099 — Kernel types need no workspace

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.8
- **Decided by**: the product owner

## Question

Under ADR 0048, a query or a workspace-scope command sent without a workspace fails `WORKSPACE_INVALID`, and query definitions have no `scope`. That would refuse:

- `POST /queries/kernel.health.get` without a workspace;
- `kernel.shutdown` from `kvman stop`, which has no workspace (`12` §12.5);
- later kernel queries that belong to no workspace (`kernel.presets.list`, `kernel.user.preferences.get`, …).

## Options

1. **Kernel types need no workspace.**
2. A scope for each kernel type, with an optional `scope` on query entries in the manifest schema.
3. Only the types M1.8 needs are global.

## Decision

Option 1:

- The kernel is available in every workspace. A `kernel.*` command or query sent without a workspace runs without one.
- One sent with a workspace keeps it, for example `kernel.cancel` in workspace A.
- Extension types keep the rules of ADR 0048.

## Consequences

`03` §3.8 states it. The registry resolves a kernel type without a workspace, and the protocol does not change.
