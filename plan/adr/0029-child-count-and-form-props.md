# ADR 0029 — `ComponentSpec.childCount`; `form` is not an input control

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.4
- **Decided by**: the product owner

## Questions

1. `split` takes "exactly 2" children (`08` §8.8), but `ComponentSpec.children` names components, not a count.
2. "Every input takes `label`, `help`, `required`, and `value`" (`08` §8.8), and `form` is listed in the Input family.

## Decisions

1. `ComponentSpec.childCount?: { min?: number; max?: number }`; `split` has `{ min: 2, max: 2 }`. Validation and `/schema` read it (alternative rejected: split's panes as props).
2. `form` is a container: only the input controls (`textInput`, `textArea`, `numberInput`, `select`, `checkbox`, `switch`, `dateInput`, `upload`, `composer`) take `label`, `help`, `required`, `value`, and `disabledIf`; `form` takes `command`, the `FormOverrides` fields, and `then`.

## Consequences

`08` §8.8 shows `childCount` and names the input controls; `12` §12.7 lists `childCount` per component.
