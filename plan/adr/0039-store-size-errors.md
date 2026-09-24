# ADR 0039 — Oversize values fail at the call

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.2
- **Decided by**: the product owner

## Question

kv values are limited to 1 MB and step results to 256 KB (`04` §4.3, §4.5), without an error code or a moment of failure.

## Decision

`kv.set` with a value over 1 MB and `ctx.step` with a result over 256 KB throw `PAYLOAD_TOO_LARGE` at the call, with params `{ limit: 'kv-value' | 'step-result', max }`. A step whose result is too large is not recorded. (Alternative rejected: buffering the value and failing the unit at commit.)

## Consequences

`04` §4.3 and §4.5 name the code.
