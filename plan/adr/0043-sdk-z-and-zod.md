# ADR 0043 — `z` in the SDK and its Zod dependency

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.3
- **Decided by**: the product owner

## Question

`05` §5.3 says `z` from `@kvman/sdk` is Zod 4 plus `blobId()`, `text()`, and `action()`. The SDK had no Zod dependency.

## Options

1. **The SDK depends on `zod`** (the same exact version as protocol) and exports `z` with the three helpers built from protocol's schemas.
2. Protocol re-exports Zod's `z`.
3. The SDK depends on `zod` but adds `text()` and `action()` only with UI registration (M2.10).

## Decision

Option 1: `@kvman/sdk` depends on `zod` `4.6.5`, pinned exactly like `@kvman/protocol`, and exports `z` = Zod's `z` plus `blobId()`, `text()`, and `action()`, which return protocol's `blobIdSchema`, `Text` schema, and `Action` schema, so their JSON Schemas are those of ADRs 0018 and 0023.

## Consequences

`05` §5.3 names the dependency.
