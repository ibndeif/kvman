# ADR 0157 — UI validation: bindings, values, error codes, and pages without an owner

- **Status**: accepted
- **Date**: 2026-09-28
- **Milestone**: M2.10
- **Decided by**: the product owner

## Question

`06` §6.3 and `08` §8.4–§8.9 list the UI rules, but leave open:

- **Bindings.** Which binding paths are checked against a declared schema ("bindings against schemas")?
- **Values.** How are command payloads and component props, both JSON Schemas, checked when views put bindings where values go?
- **Codes.** Which codes do enable, preset apply and stage, preset update, and reload use for UI reference failures?
- **Pages.** Whose rules apply to `kernel.validate { workspaceId, page }`, whose page has no owner?
- **Kernel targets.** `08` §8.7 lets views target "`kernel.*` queries marked any, and admin commands when [the owner] holds `kernel.admin`". That leaves out admin queries (`kernel.messages.list`) and `user` commands (`kernel.extension.uninstall`), which the platform pages need.

## Options

- **Bindings:**
  1. **Every root with a schema.**
  2. Only the roots the plan names (`$slot`, `$props`, `$item` of actions and renderers).
- **Values:**
  1. **Literals checked, bindings pass.**
  2. Keys only.
- **Codes:**
  1. **Specific codes first, then `VALIDATION_FAILED`.**
  2. `VALIDATION_FAILED` for all.
- **Pages:**
  1. **A preset page.**
  2. A new optional `owner` field.
- **Kernel targets:**
  1. **By sender class.**
  2. The literal text.

## Decision

Option 1 in each case.

**Bindings**

A path exists when some reading of the schema declares it (the rule of ADR 0109 for lanes). Checked:

- `$slot.*` against the slot's `props`. A frame slot passes no props, so `$slot` there is an issue.
- `$props.*` inside a composite against its `props`.
- `$item.*` against the record's schema:
  - in an entity action (its `entity`);
  - in a renderer for `entity:<name>` (the entity) or for a target (the target's `item`);
  - in a `table` or `list` with `entity` (the entity), in its columns and item view.
  - A `mime:` renderer's `$item` is not checked.
- `$query.<alias>`: the alias is declared by the page, panel, toolbar item, or status item that holds the node. The rest of the path exists in that query's output schema.
- `$route.*` in a page: the route's `:params` and its `params` keys.
- `$state.*` in a page: the first segment is a key of its `state`, also for `set` keys.

Not checked: `$form`, `$value`, `$selection`, `$upload`, `$reply`, `$t`, `$locale`, `$workspace`, `$user`, `$app`, and `$route` outside pages.

**Values**

- A command action's payload, a declared query's, badge's, or slash menu's payload (`06` §6.3: "the payload bindings satisfy its input schema"), a `slot` node's props, and an extension component's props are checked against their JSON Schema:
  - every key exists in the schema (an unknown key fails where the schema forbids additional properties);
  - literal values are validated against their field's schema;
  - a binding or a string with `{{ }}` is accepted for any field.
- A command action missing a required field fails, unless it has `form`, which fills the missing fields.
- A component missing a required prop always fails.

**Kernel targets**

By the sender column of `03` §3.8:

| Sender | A view may target it |
|---|---|
| `any`, including "any for its own" | always |
| `admin`, `user`, and `kernel.cancel` | when the view's owner holds `kernel.admin` |
| `grant` | only through `openGrantDialog` |
| capability `llm` (`kernel.llm.complete`, `kernel.llm.tokens.count`) | never: a person does not call models |

- `kernel.extension.reload` and `kernel.preset.update` are plain `admin` targets only when the literal payload has no `grants` (reload), or a literal `patch` without `extensions` (update), and no `form`. Otherwise they are grant commands.
- A preset page targets only the queries marked `any`.
- A command action must name a command, and a declared query a query.

**Where each rule runs**

- A rule that reads only the extension's own manifest runs at recording and in `kernel.validate { manifest }` (`EXT_MANIFEST_INVALID` at recording):
  - its own slots, entities, targets, components, types, and queries;
  - view rules;
  - access and `calls` coverage.
- A rule that reads another extension runs against the workspace's enabled set, at enable, preset apply and stage, preset update, reload (for the extension and every enabled dependent), and `kernel.validate { workspaceId }`:
  - foreign slots, entities, targets, and public components;
  - composite cycles and depth across extensions;
  - routes;
  - preset references.
- A foreign placement whose owner is not enabled is inactive: a warning, never an error.
- The preset's own references (nav items, `app.home`, and the `hidden`, `labels`, and `layout.order` warnings) and its pages' views are checked where the preset is written (apply stage, apply, update) and in `kernel.validate { preset }`. An enable or a reload checks the extensions, with the preset's pages counting only as active routes, so a preset reference never blocks enabling an extension.

**Codes**

Every issue is listed, and the code is that of the first category found, in this order:

1. `EXT_REQUIRES_MISSING`: a `requireComponents` entry not provided, or not public, in the workspace.
2. `ROUTE_CONFLICT`: two active pages with one route.
3. `PRESET_REFERENCE_MISSING`: a preset's nav item or `app.home` naming nothing.
4. `VALIDATION_FAILED`: every other broken view reference (props, slot `accepts`, cycles, depth, allowed targets).

The UI checks run after the checks of ADR 0151 (namespaces, grants, `requireTypes`, config) and provider conflicts.

**Pages**

`kernel.validate { workspaceId, page }` checks the page as one of the workspace preset's pages:

- it may target every `all` or `user` type of the enabled extensions, and the `kernel.*` queries open to all;
- it may use public components of enabled extensions;
- its route must not clash with an active page (`ROUTE_CONFLICT` as an issue).

## Consequences

- `06` §6.3 points here for these rules, and `03` §3.8's `kernel.validate` row says M2.10 adds the UI checks.
- The failures an extension sees at enable are listed issues with the code above.
