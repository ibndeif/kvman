# ADR 0048 — Messages and events without a workspace

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.3
- **Decided by**: the product owner

## Question

`03` §3.3 says a message without a workspace "may target only `global`-scope types" but names no code; `07` §7.1 says every message from the shell carries the current workspace while `06` §6.4 says global-scope types have no workspace; and nothing says who receives an event published without a workspace (a global-scope handler's event, or a kernel event).

## Options

- Workspace-scope type without a workspace: **`WORKSPACE_INVALID`**, `TYPE_NOT_FOUND`, or `VALIDATION_FAILED`.
- Global-scope type with a workspace: **run it globally**, reject it with `WORKSPACE_INVALID`, or accept it only when the owner is enabled in that workspace.
- Event without a workspace: **one global delivery per subscribing extension**, or one delivery per workspace where the subscriber is enabled.

## Decision

- A message without a workspace that targets a `workspace`-scope type fails `WORKSPACE_INVALID`, with a hint that the type needs a workspace (as ADR 0040).
- A message with a workspace that targets a `global`-scope type is resolved as global: its owner must be enabled, and not quarantined, in at least one workspace, and admission (M1.4) stores the message without a workspace.
- An event without a workspace is delivered once to each subscribing extension that is enabled, and not quarantined, in at least one workspace; the subscription handler runs without a workspace (`ctx.store.global` only).

Follow-up answers (same milestone):

- An **event type** resolves without a workspace like a global-scope command (its owner enabled, and not quarantined, in at least one workspace), so admission can resolve events published without a workspace; queries and workspace-scope commands without a workspace fail `WORKSPACE_INVALID`.
- When a type resolved globally is registered by two extensions that share a namespace and are each enabled in some workspace, lookup fails `NAMESPACE_CONFLICT` naming both (fail closed), rather than preferring either.

## Consequences

`03` §3.3 step 3 and `06` §6.4 state these rules; the registry (ADR 0045) answers them.
