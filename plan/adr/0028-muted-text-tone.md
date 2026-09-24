# ADR 0028 — `text` accepts the tone `muted`

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.4
- **Decided by**: the product owner

## Question

The acme-ui example (`08` §8.9) writes `{ type: 'text', tone: 'muted' }`, but `text.tone` was a `Tone` (`neutral`, `info`, `success`, `warning`, `danger`).

## Decision

`text.tone` accepts a `Tone` or `muted` (secondary text); every other component keeps `Tone`.

## Consequences

`08` §8.8 shows `tone?: Tone | 'muted'` on `text`.
