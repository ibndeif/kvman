# ADR 0142 — `compatibleWith` lists higher data versions

- **Status**: accepted
- **Date**: 2026-09-27
- **Milestone**: M2.7
- **Decided by**: the product owner

## Question

ADR 0046 says `compatibleWith` holds versions **lower** than the code's own data version. `04` §4.8 uses it in two places that need **higher** versions:

- rollback is allowed when "the older version registers `compatibleWith` covering" the newer stored version;
- after a part-way migration failure, the active version stays active if "its storage version or `compatibleWith` covers" the intermediate version, which is above its own.

Under ADR 0046 neither clause can ever apply.

## Options

1. **Higher versions**: `compatibleWith` lists newer data versions this code can still run on.
2. Lower versions, declared by the newer code for older code that can still read its data; `04` §4.8 is rewritten.
3. Drop `compatibleWith`.

## Decision

Option 1.

- `registerDataVersion(version, { compatibleWith })` lists data versions **higher** than `version`, without duplicates, that this code can still run on unchanged. Anything else is an `EXT_MANIFEST_INVALID` issue. Migrations still cover every step from 2 to `version` (ADR 0046).
- **Covers**: a code version covers a stored data version when it equals the code's data version or appears in its `compatibleWith`.
- Where it applies:
  - **Enable, stored version newer:** a stored version above the code's data version fails `SCHEMA_TOO_NEW`, unless the code covers it. The enable then goes ahead without a migration.
  - **Rollback or reload to a lower data version:** a target whose data version is below the stored one fails `EXT_ROLLBACK_BLOCKED` unless the target covers the stored version (ADR 0145).
  - **Part-way failure:** the active version stays active only if it covers the intermediate version.

## Consequences

- The manifest rule in the kernel's name rules changes from "lower" to "higher".
- The SDK's `DataVersionDef` comment says so.
- ADR 0046 is marked as amended by this ADR.
- `04` §4.8 states the "covers" rule.
