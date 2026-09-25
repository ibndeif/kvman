# ADR 0068 — Where a subscription to a live event fails

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.6
- **Decided by**: the product owner

## Question

"A subscription to a live event fails validation" (`05` §5.3, M1.6 Done-when), but structural validation and `kernel.validate` arrive in M2.1 and enabling in M2.3.

## Options

1. **At record time and at registry build.**
2. At record time only; foreign live events from M2.3.

## Decision

Option 1:

- Recording `setup` fails `EXT_MANIFEST_INVALID` with an issue at `subscriptions.<n>.event` for a subscription to one of the extension's own live events.
- Building the registry fails `EXT_MANIFEST_INVALID` when an installed extension subscribes, by exact type, to another installed extension's live event; the failure names the subscriber and the event.
- A wildcard subscription never matches a live event (already the case).
- M2.1's structural validation and M2.3's enable report the same rule.

## Consequences

`05` §5.3 names where the rule is checked.
