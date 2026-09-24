# ADR 0037 — `collection.patch` is a JSON Merge Patch

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.2
- **Decided by**: the product owner

## Question

`col.patch(id, partial)` "merges into the existing doc" (`04` §4.3) without saying how.

## Decision

A JSON Merge Patch (RFC 7396), as `kernel.preset.update` uses: nested objects merge, arrays are replaced whole, and `null` removes a field. The result must pass the collection's schema like any write. (Alternative rejected: a shallow merge.)

## Consequences

`04` §4.3 states it.
