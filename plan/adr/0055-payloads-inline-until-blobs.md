# ADR 0055 — Payloads inline until the blob store

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.4
- **Decided by**: the product owner

## Question

Payloads over 256 KB spill to a blob (`02` §2.2), but the blob store comes in M2.5.

## Options

1. **Inline up to 16 MB until M2.5.**
2. Refuse over 256 KB until M2.5.

## Decision

Option 1: until M2.5 a payload up to 16 MB is stored inline; M2.5 adds the spill to `payload_ref` over 256 KB. A payload over 16 MB fails `PAYLOAD_TOO_LARGE` with `{ limit: 'payload', max: 16777216 }`.

## Consequences

`02` §2.13 names the params.
