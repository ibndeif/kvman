# ADR 0050 — `Ctx` and `MigrationContext` declare only what is built

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.3
- **Decided by**: the product owner

## Question

Handler and migration definitions (M1.3) need parameter types, but `ctx` is built across M1.6–M2.x and a migration's `m` in M2.7; `04` §4.8 names only `m.config.get(scope, workspaceId?)` and `m.config.set(scope, value, workspaceId?)` and leaves the bulk data calls unspecified.

## Options

1. **Declare only what exists**: each milestone adds the members it builds.
2. Declare every member now, as types without implementations.
3. Declare `Ctx` only; `up` takes no argument until M2.7.

## Decision

Option 1:

- `Ctx` declares `store` (`04` §4.3) and `step` (`04` §4.5), built in M1.2; M1.6 and later milestones add the members of `05` §5.4 they build.
- A migration is `{ to, up(m: MigrationContext): Promise<void> }`. `MigrationContext` has `config.get(scope, workspaceId?)`, returning the stored value or `undefined`, and `config.set(scope, value, workspaceId?)`, as `04` §4.8 names them; M2.7 adds the bulk data calls after asking their shape.

## Consequences

`05` §5.4 notes that the SDK's `Ctx` grows with the milestones.
