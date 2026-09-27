# ADR 0046 — Migrations cover every version step

- **Status**: accepted; amended by ADR 0142 (`compatibleWith` lists higher versions)
- **Date**: 2026-09-24
- **Milestone**: M1.3
- **Decided by**: the product owner

## Question

`04` §4.8 runs the steps `to: n` in order but does not say whether every step must exist.

## Options

1. **Contiguous**: exactly one migration for each `to` from 2 to the data version.
2. Unique and at most the data version; gaps skipped.

## Decision

Option 1: `registerDataVersion(version, { migrations })` has exactly one migration for each `to` in `2..version`, so any stored version can be brought up step by step. `compatibleWith` holds versions lower than `version`, without duplicates. Anything else is an `EXT_MANIFEST_INVALID` issue.

## Consequences

`04` §4.8 states the rule.
