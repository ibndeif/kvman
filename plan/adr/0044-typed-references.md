# ADR 0044 — Typed references are branded names

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.3
- **Decided by**: the product owner

## Question

"Every `register*` call returns a typed reference that can be passed instead of the name" (`05` §5.3). What is a reference at runtime?

## Options

1. **A branded name string**: the name itself, with a type-only brand.
2. A frozen object `{ kind, name }` that every API unwraps.

## Decision

Option 1: a reference is the registered name (`'pdf.translate'`, `'files'`, `'pdf/NOT_FOUND'`) typed with a brand that carries its kind and its input, output, payload, document, or entry type. It needs no runtime object and works wherever a name works. A log family's reference (`'history:*'`) types a log of that family: `ctx.store.log(history, key)` is the log `history:<key>`.

## Consequences

`05` §5.3 and `04` §4.3 describe references and the family form of `log()`.
