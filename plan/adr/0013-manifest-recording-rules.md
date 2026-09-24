# ADR 0013 — Manifest recording rules

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.3
- **Decided by**: the product owner

## Question

`05` §5.12 gives the manifest's sections and an example but leaves open: the shape of a UI entry ("its id, description, and definition"), what a section holds when its `ext` call is never made, the shape of `requireTypes` and `requireComponents` entries, and which defaults are written into the manifest.

## Options

1. **UI entries as `{ id, ...definition }`**, once-only sections `null` when not called, list sections `[]`, `require*` entries mirroring their calls, defaults written explicitly.
2. The same, with UI entries as `{ id, description, definition }`.

## Decision

Option 1:

- A UI entry is `{ "id": "<ns>.<name>", ...definition }`: the registered definition's own fields (its `description` included) beside its id.
- `config`, `translations`, `ui.settingsSection`, and `permissions.isolation` are `null` when their call is never made; every list section is `[]` when nothing is registered.
- `requireTypes` entries are `{ types: string[], reason: Text }` and `requireComponents` entries are `{ components: string[], reason: Text }`, one per call.
- Defaults are written explicitly: `access: "all"`, an error's `retryable: false`, a collection's or entity's `idField: "id"`, an event's `delivery: "durable"`, `data.version: 1`, `data.compatibleWith: []`. Every other optional field is left out when it was not given.
- M0.3 validates each UI entry's `id` and `description`; M0.4 replaces the definitions with the full shapes of `08` §8.5.

## Consequences

`05` §5.12 lists these rules.
