# ADR 0107 — Required types must be covered by the extension's capabilities

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.1
- **Decided by**: the product owner

## Question

`06` §6.3 says "Capabilities cover what is referenced statically: `requireTypes`, …". A required type's kind (command, query, or event) is unknown until its owner is enabled. M1.3-E8 accepted `requireTypes(['fs.file.get'])` with no `calls`.

## Options

1. **Covered by `calls` or a subscription**, checked at install.
2. **Only at enable**, reading §6.3's sentence as applying to views only.
3. **Covered by `calls`** at install, with events exempted at enable.

## Decision

Option 1. Each type named by `requireTypes` must be one of these:

- one of the extension's own types;
- a `kernel.*` type;
- matched by one of its `calls` patterns;
- matched by one of its subscriptions (exactly or by a `<prefix>.*` pattern).

Otherwise it is an error at `permissions.requireTypes.<i>.types.<j>`, with the hint
`add ext.requestCapability('calls', { types: ['<type>'] }), or subscribe to it if it is an event`.

## Consequences

- M1.3-E8 now requests `calls` for `fs.file.get`.
- `06` §6.3 states the rule.
