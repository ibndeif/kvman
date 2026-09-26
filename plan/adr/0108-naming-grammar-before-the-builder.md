# ADR 0108 — Naming-grammar severity before the builder

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.1
- **Decided by**: the product owner

## Question

Grammar violations are warnings for installed extensions and errors for builder-generated ones (`02` §2.4, ADR 0010). Nothing is builder-generated before M6. Which severity does M2.1 use, and how does a caller ask for the strict one?

## Options

1. **Warnings now; M6 adds strict.** Install and `kernel.validate` report grammar findings as warnings, and M6 decides how the builder asks for errors.
2. **A `generated` flag on `kernel.validate`** now.
3. **Severity from the caller** (errors when the builder extension asks).

## Decision

Option 1.

- Every type name is checked with the naming grammar.
  - A `format` finding is an error: segments, the namespace's length.
  - A `grammar` finding is a warning (`severity: 'warning'`) at `types.<i>.type`, with the checker's message and hint.
- With a `namingException` the finding is reported as a warning `excepted: <reason>` that keeps the hint (ADR 0016).
- A recording with warnings only is valid. `recordExtension` returns its warnings beside the manifest; M2.2's stage result lists them.
- M6 decides how `kernel.dev.build` and the builder get errors instead.

## Consequences

`02` §2.4 notes that the strict severity arrives with the builder (M6).
