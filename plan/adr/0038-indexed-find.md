# ADR 0038 — When a `find` is indexed

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.2
- **Decided by**: the product owner

## Question

"An unindexed `find` works but scans at most 10,000 documents (`STORE_RESULT_TOO_LARGE` beyond) and logs a warning" (`04` §4.3), without defining "indexed".

## Options

1. **The first field of a declared index is constrained.**
2. SQLite's query planner decides (`EXPLAIN QUERY PLAN`).

## Decision

Option 1. A `find` (or `count`) is indexed when a top-level `where` condition, outside `$or`, constrains the first field of one of the collection's declared indexes, or when the first `orderBy` field is the first field of a declared index and a `limit` is given. Otherwise it is unindexed: when the collection holds more than 10,000 documents in the queried scope it fails `STORE_RESULT_TOO_LARGE` (hint: add an index or a filter on an indexed field); otherwise it runs and logs the warning (kernel log, `warn`, once per query shape and hour).

## Consequences

`04` §4.3 states the rule.
