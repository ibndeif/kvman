# ADR 0027 — The event carried by SSE `event` messages

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.4
- **Decided by**: the product owner

## Question

The SSE message `event { sid, seq, event }` (`12` §12.3) does not define `event`, and the `events` table (`04` §4.1) stores only part of the message envelope, so a replay could not rebuild a full `Message`.

## Options

1. **The `events` table's fields.**
2. The full envelope, with more columns in `events`.

## Decision

Option 1: `event` is `{ id, type, source, workspaceId?, payload, correlationId, causationId?, createdAt }`, for durable and transient events alike, so a live push and a replay look identical.

## Consequences

`12` §12.3 shows the shape.
