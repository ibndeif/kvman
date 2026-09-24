# ADR 0061 — Kernel types in the registry, and where dead letters are announced

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.5
- **Decided by**: the product owner

## Questions

1. `kernel.message.dead-lettered { messageId, type, correlationId }` is published when a message dies, but the registry knows only extension manifests. How is it published?
2. In which workspace is it published? Its payload has no workspace, and ADR 0048 delivers a workspace-less event once to each subscriber enabled anywhere.

## Options

1. **The kernel is a registry owner** with the types each milestone builds; or write only an `events` row until kernel types exist.
2. **The dead message's workspace**; or always without a workspace.

## Decision

1. The registry gains the kernel as an owner (`kernel`), always available and never quarantined, holding the kernel types that the built milestones emit; each later milestone adds its own. M1.5 adds `kernel.message.dead-lettered` (durable, payload schema from `@kvman/protocol`). It is published through normal publish admission from the source `kernel`, in the same transaction that marks the message `dead`, so subscribers get delivery rows.
2. The event carries the dead message's `workspaceId`, so subscribers enabled in that workspace receive it and run there. A message without a workspace gives an event without one (ADR 0048).

## Consequences

`03` §3.1 item 6 and the kernel events table of `03` say this.
