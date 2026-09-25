# ADR 0080 — Quarantine before install exists

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.7
- **Decided by**: the product owner

## Question

Quarantine writes `extensions.status` and `quarantine_reason` (`03` §3.6), but install (M2.2) creates the `extensions` rows, and until then the registry's input is given as data.

## Options

1. **Upsert the row and flag the registry.**
2. Keep it in memory until M2.2.

## Decision

Option 1. A quarantine upserts the `extensions` row (`name`, `status: 'quarantined'`, `quarantine_reason`) and publishes `kernel.extension.quarantined { name, reason }` in the same unit. The registry marks every extension with such a row as `quarantined`, and admission refuses it with `HANDLER_UNAVAILABLE` (already built). A restart keeps it. The person's notification comes with the notification tray (M2.12, which lists it), and the risk banner with the shell.

## Consequences

`15` M1.7 notes the split.
