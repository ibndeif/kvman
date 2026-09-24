# ADR 0033 — `@types/better-sqlite3`

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.1
- **Decided by**: the product owner

## Question

`better-sqlite3` 13.0.3 (R-Q1, ADR 0001) ships no TypeScript declarations, and the kernel's driver adapter is written in strict TypeScript.

## Options

1. **`@types/better-sqlite3@9.6.0`** as a dev dependency (the latest; the API the adapter uses is unchanged in v13).
2. A declaration file in the kernel covering only what the adapter calls.

## Decision

Option 1, pinned exactly, a dev dependency of `@kvman/kernel`.

## Consequences

`00` D55 names it next to `better-sqlite3`.
