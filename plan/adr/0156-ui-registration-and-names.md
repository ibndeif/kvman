# ADR 0156 — Recording UI registrations: names, nav items, and `since`

- **Status**: accepted
- **Date**: 2026-09-28
- **Milestone**: M2.10
- **Decided by**: the product owner

## Question

M2.10 records every UI `register*` call. The plan leaves three things open:

- **Names.** `05` §5.3 says public names, UI contributions included, are written in full when registered. `08`'s examples registered short names (`ext.registerNavGroup('documents')`, `ext.registerSlot('chat.prompt')`, `ext.registerComponent('fileCard')`).
- **Nav items.** Which pages and nav groups may an extension's nav item name?
- **`since`.** `08` §8.8 says validation records the minimum shell version a view needs, but no manifest field holds it and no shell exists yet.

## Options

- **Names:**
  1. **Full names; correct `08`.**
  2. Short names for UI, prefixed by the recorder.
- **Nav items:**
  1. **Its own page; any group.**
  2. Any page of an enabled extension, inactive when missing.
- **`since`:**
  1. **Later, with the shell.**
  2. Now, as a manifest field.

## Decision

Option 1 in each case.

**Names**

- Every UI `register*` call takes the full public name: `ext.registerSlot('agent.chat.prompt', …)`, `ext.registerComponent('pdf.fileCard', …)`.
- A name without its namespace fails `EXT_MANIFEST_INVALID` with the hint that shows the full name, exactly as for message types.
- UI names (pages, nav groups, nav items, toolbar items, status items, panels, slots, actions, renderer targets, renderers, components) are one name set (`05` §5.3); a duplicate across these kinds fails.
- `08`'s examples are corrected.

**Recording**

- The SDK gains `registerPage`, `registerNavGroup`, `registerNavItem`, `registerToolbarItem`, `registerStatusItem`, `registerPanel`, `registerSlot`, `registerAction`, `registerRendererTarget`, `registerRenderer`, `registerComponent`, and `registerSettingsSection` (at most once), with the shapes of `08` §8.5 and §8.9. Composite props use `z.text()` and `z.action()`, which the SDK has had since M0.4 (ADRs 0023, 0043).
- Schemas are recorded as JSON Schema under the lossless rule of `06` §6.3:
  - a slot's `props` and a composite's or widget's `props` in the input view (ADR 0077), because a using view passes them: defaulted props are optional, and only a strict object refuses unknown props;
  - a renderer target's `item` in the output view.
- A page's `params` given as a Zod object whose fields are strings, numbers, or booleans (optional or not) is recorded in the map form `08` §8.5 gives JSON (`{ fileId: 'string' }`); any other schema fails `EXT_MANIFEST_INVALID`.
- `registerTranslations` stays with M2.11.

**Nav items**

- `page` names one of the extension's own pages; any other name fails `EXT_MANIFEST_INVALID` at recording.
- `group` may name any nav group id: `08` §8.4 shows an item whose group is hidden or missing at the top level, so a missing group is not an issue.

**`since`**

- Every built-in spec has `since: '2.0.0'`, the first shell release, so no view needs more yet.
- Validation records the minimum shell version once a component's `since` is later than that. The manifest shape does not change now.

## Consequences

- `08` §8.4, §8.5, §8.9, §8.10, and §8.21 register full names; `08` §8.8 notes the `since` rule.
- The M0.3 fixture `packages/protocol/test/fixtures/pdf-manifest.json` records its component props in the input view.
- `@kvman/sdk` gains the UI registration methods and their definition types (a changeset).
