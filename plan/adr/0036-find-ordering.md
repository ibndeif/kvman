# ADR 0036 — How `find` orders documents

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.2
- **Decided by**: the product owner

## Question

`find({ orderBy })` (`04` §4.3) does not say how values of different types, missing fields, or equal values sort. SQL and the read-your-writes overlay (which re-sorts in JavaScript) must agree.

## Options

1. **Type ranks, then value; ties by document id.**
2. The same with missing and `null` values last.

## Decision

Option 1. Ascending order ranks values as: missing or `null` < `false` < `true` < numbers < strings (by Unicode code point, SQLite `BINARY`) < arrays and objects (not ordered among themselves). `desc` reverses the whole order. Documents that compare equal on every `orderBy` field are ordered by id, ascending, so every result is deterministic.

## Consequences

`04` §4.3 states the order.
