# ADR 0032 — Priority encoding, busy timeout, unit-of-work limit code

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.1
- **Decided by**: the product owner

## Questions and decisions

1. `messages.priority` is an INTEGER (`04` §4.1): **`interactive` 0, `normal` 1, `background` 2**, so ascending order is highest class first, matching the index `(state, priority, not_before)`.
2. `busy_timeout` is "set" (`04` §4.1): **5000 ms**; a lock still held after that is `STORAGE_UNAVAILABLE`.
3. A unit of work over its limits (8 MB of writes, 1,000 messages, `04` §4.2) fails with **`PAYLOAD_TOO_LARGE`**, params `{ limit: 'writes' | 'messages', max }`, not retryable.

## Consequences

`04` §4.1 and §4.2 state these values.
