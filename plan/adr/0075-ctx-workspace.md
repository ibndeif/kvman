# ADR 0075 — `ctx.workspace` before workspaces are created

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.6
- **Decided by**: the product owner

## Question

`ctx.workspace` is `{ id, path, name }` (`05` §5.4), but workspaces are created in M2.3.

## Options

1. **Read the `workspaces` table** at dispatch; a missing row fails `WORKSPACE_INVALID`.
2. A workspace directory given as data until M2.3.

## Decision

Option 1. The kernel reads the message's workspace row when it dispatches an invocation (tests insert rows). A message whose workspace has no row fails `WORKSPACE_INVALID` without retry. Invocations without a workspace (global scope) have no `ctx.workspace`.

## Consequences

None beyond `05` §5.4's note.
