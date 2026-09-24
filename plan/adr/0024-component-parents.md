# ADR 0024 — `ComponentSpec.parents`

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.4
- **Decided by**: the product owner

## Question

M0.4 must reject "a tab outside tabs", but a `ComponentSpec` only says which children a component accepts, and `stack` accepts `any`.

## Options

1. **A `parents` field** on the spec.
2. `any` excludes a fixed list of components.

## Decision

Option 1. `ComponentSpec.parents?: string[]` names the only components a component may be a child of: `tab` → `tabs`, `menuItem` → `menu`. A `children` node appears only inside a composite that declares `children`. A parent whose `children` is `any` accepts every component whose `parents` is absent or lists it.

## Consequences

`08` §8.8 shows `parents`; `12` §12.7 lists it per component (ADR 0025).
