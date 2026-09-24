# ADR 0023 — `z.text()` and `z.action()` in JSON Schema

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.4
- **Decided by**: the product owner

## Question

Composite components declare `Text` props with `z.text()` and event props with `z.action()` (`05` §5.3, `08` §8.9). Their manifests store props as JSON Schema, and validation must recognize these props (an action passed in is checked against the passing view's owner). The plan does not say how they are written.

## Options

1. **Full schema plus a format marker**, like blob ids (ADR 0018).
2. A marker only, with the value validated by the protocol's Zod schema.
3. A `$ref` to kvman schema ids.

## Decision

Option 1. `z.text()` converts to the protocol's `Text` JSON Schema with `format: "kvman-text"`, and `z.action()` to its `Action` JSON Schema with `format: "kvman-action"`.

## Consequences

`05` §5.3 states both; `@kvman/protocol` exports the schemas the SDK will use.
