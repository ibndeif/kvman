# ADR 0053 — Durable event deliveries and publishes in the unit

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.4
- **Decided by**: the product owner

## Question

A durable event goes to the `events` log and to "an inbox row per receiver" (`02` §2.5); `04` §4.1 names the row's `handler` as "extension (and subscription id for events)" without a format, and the unit of work has no shape for publishes.

## Options

1. **One row per matching subscription.**
2. One row per subscribing extension, running only its most specific subscription.

## Decision

Option 1:

- A unit carries `publishes: Array<{ type, payload }>` beside `sends` (`ctx.publish(type, payload)`); both count toward the 1,000-message limit.
- A durable event writes one `events` row with the event's id, plus one `messages` row per matching, granted subscription: a new ULID `id`, `causationId` = the event's id, the event's type, source, payload, context, priority, and correlation; `handler` = `<extension>|subscription:<pattern>`; the lane rendered from the subscription's template; idempotency key `<eventId>:<handler>` under the publisher's source. An extension with two matching subscriptions gets two rows.
- A subscription lane that cannot be rendered (every path missing, or a value that is not a string or number) does not affect the publisher: that one delivery is stored `failed` with `VALIDATION_FAILED`, and the other deliveries are pending as usual (a follow-up answer).
- A transient event is admitted the same way but not stored; the commit result hands it to the live bus.

## Consequences

`04` §4.1 and §4.2 state the row format and the unit's `publishes`.
