# ADR 0026 — Binding path grammar

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.4
- **Decided by**: the product owner

## Question

`08` §8.7 defines a binding as `$<root>` followed by `.<segment>` parts, without the characters of a segment or whether the root list is closed.

## Options

1. **Identifier-like segments and a closed root list.**
2. Any characters but `.` and whitespace.

## Decision

Option 1:

- A segment is `[A-Za-z0-9_-]+`; an array index is digits without a leading zero.
- The roots are exactly `$route`, `$query`, `$state`, `$form`, `$item`, `$value`, `$selection`, `$upload`, `$reply`, `$slot`, `$props`, `$t`, `$locale`, `$workspace`, `$user`, `$app`; any other root is malformed.
- `$query.<alias>` and `$t.<key>` need at least one segment; the other roots may stand alone (`$item`, `$value`).
- `.length` is an ordinary segment that the resolver treats as an array's length.
- A string starting with `$$` is a literal, not a binding.

## Consequences

`08` §8.7 states the grammar.
