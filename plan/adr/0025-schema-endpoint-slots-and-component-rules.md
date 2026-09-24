# ADR 0025 — The schema endpoint lists frame slots and component rules

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.4
- **Decided by**: the product owner

## Question

`12` §12.7 says `/schema` "lists the frame slots with their `accepts` and every component spec with its `events` and `children`", but its shape has no field for them.

## Decision

The shape gains `frameSlots: [{ name, description, accepts, max? }]`, and each component entry gains `events`, `children`, and `parents?` (ADR 0024).

## Consequences

`12` §12.7 shows the fields.
