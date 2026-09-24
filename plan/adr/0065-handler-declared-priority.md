# ADR 0065 — A handler's declared priority

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.5
- **Decided by**: the product owner

## Question

`CommandDef.priority` (`05` §5.5, recorded in the manifest) has no stated meaning, and admission ignores it.

## Options

1. **The default when the sender requests none**, capped by the lowering-only rule.
2. A ceiling for the handler, whatever the sender asks.
3. Remove the field.

## Decision

Option 1. When a send requests no priority, admission uses the handler's declared priority as the request; the lowering-only rule then caps it at the inherited class. A handler declared `background` runs bulk work in background; a handler declared `interactive` never raises a `normal` chain. A sender's explicit request wins over the declaration (and is capped the same way).

## Consequences

`02` §2.6 and `05` §5.5 state this.
