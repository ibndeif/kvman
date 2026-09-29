# ADR 0169 — Placeholder descriptions are a recording warning

- **Status**: accepted
- **Date**: 2026-09-29
- **Milestone**: M2.13
- **Decided by**: the product owner

## Question

`14` §14.5 says "schema descriptions are linted (non-empty, not placeholder text)".

- Non-empty is already enforced: every description must contain a non-space character (ADR 0016).
- "Placeholder text" is not defined.
- No milestone's Build list names the check.

## Options

1. **A fixed placeholder list, reported as a warning.**
2. The same list, reported as an error.
3. Not in M2.13.

## Decision

Option 1.

- Recording checks every string at a key named `description` in the manifest, except under `translations`. That covers:
  - `meta.description`;
  - every registration's description;
  - the `description` of every JSON Schema inside it (from `.describe()`).
- A description is a placeholder when, trimmed and lowercased, it:
  - is one of `todo`, `tbd`, `fixme`, `xxx`, `description`, `placeholder`, `...`, or `…`;
  - starts with `lorem ipsum`;
  - or equals the name of the registration that holds it (`pdf.translate` for a command's description).
- Each placeholder is a warning at its manifest path, with the hint "describe in a sentence what it is for". Recording still succeeds (ADR 0108).
- `kernel.validate { manifest }` reports it the same way.
- The testkit prints it like a literal-text warning and does not fail (ADR 0166). The builder may make it an error for generated extensions later (`11`).

## Consequences

- `14` §14.5 states the list.
