# ADR 0052 — Capability checks with grants as data

- **Status**: accepted; the grants source over the database moved to M2.3 (ADR 0123); the grant checked is the calling invocation's (ADR 0133)
- **Date**: 2026-09-25
- **Milestone**: M1.4
- **Decided by**: the product owner

## Question

M1.4 must test `CAPABILITY_DENIED` (`03` §3.3 step 4), but grants are stored and confirmed only in M2.4.

## Options

1. **Grants as data**: admission checks `05` §5.7 against each extension's granted `Capabilities`, supplied like the registry's inputs.
2. Only the rules that need no grants.

## Decision

Option 1. Admission asks a grants source for an extension's `Capabilities` in a workspace (M2.4 implements it over the database, including the intersection for global types). It checks: a foreign command or query needs a `calls` pattern covering it (patterns never cover foreign `internal` or `user` types) or, for an `agentTool` type, `tools`; an event is published only by its owner (or the kernel), and users and processes never publish (`CAPABILITY_DENIED`); a subscription to a foreign event receives deliveries only when granted. A process acts with its extension's grants; people and the kernel are not checked against grants. The `ui` check for `ui.*` commands is added with the `ui.*` types themselves, since admission cannot resolve them before then.

## Consequences

`03` §3.3 step 4 names the grants source.
