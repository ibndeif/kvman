# ADR 0158 — Contributions and extension components on the schema endpoint

- **Status**: accepted
- **Date**: 2026-09-28
- **Milestone**: M2.10
- **Decided by**: the product owner

## Question

ADR 0111 left `/schema`'s `contributions` as `[]` until UI recording, and listed only the built-in components. M2.10 records UI. Should the endpoint list it now, and should it list private components?

## Options

- **When:**
  1. **Now.**
  2. Later, with a new ADR when a milestone needs it.
- **Private components:**
  1. **Public only.**
  2. All, with a `visibility` field.

## Decision

Option 1 in each case.

**`contributions`** lists every UI entry of each listed extension (the same extensions ADR 0111 lists, by workspace or not):

- `{ id, kind, owner, description, target? }`, the protocol's existing shape.
- `kind` is the contribution kind (`page`, `navGroup`, `navItem`, `toolbarItem`, `statusItem`, `panel`, `action`, `renderer`, `settingsSection`), or `slot` or `rendererTarget`.
- `target` is:
  - a page's route;
  - a nav item's page;
  - a panel's or toolbar item's slot;
  - an action's entity;
  - a renderer's target.
- Slots and renderer targets also carry `schema`: the slot's `props` or the target's `item`.
- A settings section's id is `settings.section.<ns>`.

**`components`**

- Adds each listed extension's **public** composites and widgets:
  - `owner` is the extension, `form` is `composite` or `widget`, and `props` is its schema;
  - `events` are its `z.action()` props, with their descriptions;
  - `children` is its rule (`none` for widgets), and `examples` are its examples (`[]` when none).
- Private components are left out, as internal types are: the endpoint describes what others may use.

`q` searches `contributions` like the other sections (ADR 0112); `components` stays listed whole, as it was for the built-in components.

## Consequences

- `@kvman/protocol`'s schema document allows the kinds `slot` and `rendererTarget` and the `schema` field on contribution entries (a changeset).
- ADR 0111's `contributions` row is corrected by this ADR.
