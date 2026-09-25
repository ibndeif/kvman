# ADR 0092 — When health is `degraded`

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.8
- **Decided by**: the product owner

## Question

`kernel.health.get` returns `status: 'ok' | 'degraded'` (`03` §3.8) without saying when it is `degraded`.

## Options

1. **While an extension is quarantined.**
2. While shutting down.
3. Either.

## Decision

Option 1: `degraded` while at least one extension is quarantined, since part of the system is unavailable and needs the recovery page; `ok` otherwise.

## Consequences

`03` §3.8 states it.
