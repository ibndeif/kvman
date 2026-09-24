# ADR 0045 — The kernel registry in M1.3

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.3
- **Decided by**: the product owner

## Question

M1.3 builds "the kernel registry built from manifests (lookup by type and workspace)", but enabling per workspace, quarantine, and grants come in M2. What does the registry take and answer now?

## Options

1. **Types and subscribers**: lookup of a type and of an event's subscribers.
2. Types only; M1.4 adds subscribers.

## Decision

Option 1: an in-memory registry built from the installed manifests (each active or quarantined) and each workspace's enabled extensions.

- `lookup(type, workspaceId?)` returns the owner and its type entry, or fails as `03` §3.3 step 3 and `13` §13.2 say: `TYPE_NOT_FOUND` when no installed manifest registers the type; `HANDLER_UNAVAILABLE` when its owner is not enabled in the workspace or is quarantined. A message without a workspace may target only `global`-scope types (`TYPE_NOT_FOUND` for a workspace-scope type), whose owner must be enabled, and not quarantined, in at least one workspace (`HANDLER_UNAVAILABLE` otherwise).
- `subscribers(eventType, workspaceId)` returns the subscriptions of the workspace's enabled, not quarantined extensions whose event or pattern matches.
- Reading the inputs from database rows comes with install and enable (M2.2, M2.3); intersecting grants for global types with M2.4.

## Consequences

`03` §3.1 item 6 notes what the registry answers.
