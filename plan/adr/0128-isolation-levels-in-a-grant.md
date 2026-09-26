# ADR 0128 — Isolation levels in a grant

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.4
- **Decided by**: the product owner

## Question

`05` §5.7 says a grant's `isolation` is "`sandboxed` or the lower level the manifest requested", and `06` §6.5 says "the user may raise isolation at any time". ADR 0123 took the first sentence literally: exactly the requested level, or `sandboxed`. With that rule an extension that requests `shared` cannot be granted `dedicated`, so M2.4's "the same sample extension runs in all three isolation modes" cannot hold for one extension.

## Options

1. **The requested level or any higher one.**
2. Exactly the requested level or `sandboxed` (ADR 0123 as written).

## Decision

Option 1. The levels are ordered `shared` < `dedicated` < `sandboxed`.

- A grant's isolation is valid when it is at or above the level the manifest requested with `requestIsolation`:
  - a `shared` request allows `shared`, `dedicated`, or `sandboxed`;
  - a `dedicated` request allows `dedicated` or `sandboxed`;
  - no request allows only `sandboxed`.
- A `builtin:` extension's isolation must be `shared` (unchanged).
- Anything else fails `CAPABILITY_DENIED` with `params.isolation`, as ADR 0123 says.

## Consequences

- `grantDifferences` compares levels by order instead of equality.
- `05` §5.7 is corrected: "`isolation` is the level the manifest requested with `requestIsolation` or any higher one (`sandboxed` when it requested none)".
- ADR 0123's isolation bullet is superseded by this rule.
