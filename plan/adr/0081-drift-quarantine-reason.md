# ADR 0081 — Manifest drift quarantines with its own reason

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.7
- **Decided by**: the product owner

## Question

`03` §3.6 says a drifting module "fails to load (`EXT_MANIFEST_INVALID`) and is quarantined", but the quarantine reasons are only `HOST_FAILURES`, `EXT_INTEGRITY`, and `MIGRATION_FAILED`.

## Options

1. **A new reason `EXT_MANIFEST_INVALID`.**
2. Count it as `EXT_INTEGRITY`.
3. Fail each load, without quarantine.

## Decision

Option 1. Drift quarantines with the reason `EXT_MANIFEST_INVALID`. As with integrity, `kernel.extension.unquarantine` refuses it with `EXT_QUARANTINED`, and the recovery page offers Rollback and Disable. The message that found the drift still fails `EXT_MANIFEST_INVALID` without retry (ADR 0071).

## Consequences

`03` §3.6's reasons table gains the row.
