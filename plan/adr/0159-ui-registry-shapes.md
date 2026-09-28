# ADR 0159 — The UI registry, page, and translations answers

- **Status**: accepted
- **Date**: 2026-09-28
- **Milestone**: M2.11
- **Decided by**: the product owner

## Question

`08` §8.6 gives the `UiRegistry` type and the three `kernel.ui.*` queries, but leaves open:

- **Catalogs.** The shape of `kernel.ui.translations.get` ("catalogs for the saved language and its fallbacks").
- **Labels.** How the registry carries a preset label, which can be one string or a map per language, when the registry does not depend on the language.
- **Composites.** Composites are used outside pages too (a panel's view, a renderer's `component`, an action's dialog, a settings section), but only `kernel.ui.page.get` returns them, and `CompositeDef` has no name or owner.
- **Sidebar.** `slots['frame.sidebar'].items` is flat, but nav items nest under groups and `layout.order` adds `"---"` separators.
- **No preset.** What the queries answer for a workspace with no applied preset, and `page.get` for a page that is not active.

## Options

- **Catalogs:**
  1. **Per owner, as registered.**
  2. Merged into flat keys by the kernel.
- **Labels:**
  1. **A `label` beside the item.**
  2. The preset's `labels` passed through at the top level.
- **Composites:**
  1. **Named entries, and in the registry for non-page items.**
  2. Every composite's definition in the registry.
- **Sidebar:**
  1. **Flat: each group followed by its items.**
  2. Nested under the group.
- **No preset:**
  1. **`PRESET_REQUIRED`; `NOT_FOUND` for an unknown page.**
  2. An empty registry with defaults.

## Decision

Option 1 in each case.

**Owners.** An item's `owner` is the package name of the extension that registered it (as in `/schema`, ADR 0158), `preset` for the preset's pages, nav groups, nav items, and separators, and `frame` for the frame slots. An extension is **active** in a workspace when the applied preset enables it and it is not quarantined; only active extensions contribute.

**Registry (`kernel.ui.get`)**

- `app`: the preset's `title`, `icon`, `theme.accent` as `accent`, `theme.mode` as `themeMode` (default `system`), and `home`. `layout`: `sidebar` default `expanded`, `statusbar` default `shown`.
- `slots`: every frame slot of the catalog (`owner: 'frame'`, its `accepts` and `max`) and every slot of an active extension (its `accepts`, and `layout` and `max` when registered). Pages are placed by route and listed in `pages`, so `frame.main` has no items.
- Items:
  - `frame.sidebar`: nav groups and nav items of the active extensions and the preset, and separators;
  - `frame.topbar.*`: toolbar items by `slot`; `frame.statusbar.*`: status items by `side` (default `end`); `frame.overlay` and extension slots: the panels and toolbar items aimed at them.
- An item is left out when its id is in `hidden`, when it is aimed at a slot, entity, or renderer target whose owner is not active (inactive, `08` §8.4), or when it is a nav item whose page is hidden or not active (hiding cascades).
- Order (`08` §8.4): `order` (default 500), then owner, then id. `layout.order[<slot>]` puts the ids it lists first, in its order, and the rest follow in that default order.
- **Sidebar.** The list is flat. Top-level entries (groups, items without a group, separators) come in order, and each group is followed at once by its own items in default order. A nav item whose group is hidden, missing, or not active is a top-level entry, and `group` is removed from its `def`. A `"---"` in `layout.order['frame.sidebar']` is `{ id: '---<n>', owner: 'preset', kind: 'separator', def: {} }`, numbered from 1 in list order; contribution ids always contain a dot, so these never clash. `"---"` in another slot is ignored.
- `pages`: every page of an active extension and every preset page, by id, with `hidden: true` when its id is in `hidden`.
- `actions`: by entity, for entities of active extensions; `renderers`: by target (`entity:<name>` of an active extension, a target of an active extension, or any `mime:` target); both leave out hidden ids and sort by owner, then id.
- `components`: every component of the active extensions, by name. A composite used by a non-page item (panels, toolbar and status items, actions, renderers, the settings sections, and composites they use, transitively) carries `def`, its registered definition without `id`.
- `extensions`: the active extensions. `settingsSections`: one per active extension with config, `id: 'settings.section.<ns>'`, `title` its `meta.title`, `scopes` from `config.scope` (`both` is `['global', 'workspace']`), `schema` its config schema, `view` its registered section view; hidden ids are left out.
- `catalogs.defaults`: the default locale of each active extension with translations, and of `preset` when the preset has translations; `catalogs.locales`: every locale they ship, sorted.
- **Labels.** A `UiItem`, a `pages[]` entry, and a `settingsSections[]` entry gain an optional `label`: the preset's `labels[id]` exactly as written (a string, literal or a `$t` key of the preset's catalog, or a map by locale). `def` stays as registered; the shell prefers `label` and picks from a map with the fallback chain of `08` §8.16.

**Revision.** `revision` is the SHA-256 (hex) of the canonical JSON of `{ workspaceId, presetRevision, extensions: [[name, activeDigest]…], quarantined: [name…], protocolVersion }`, over the extensions the preset enables, sorted by name. It changes exactly when the applied preset is written (`kernel.preset.changed`), an enabled extension's active version changes (`kernel.extension.reloaded`), or one is quarantined or unquarantined.

**Page (`kernel.ui.page.get { workspaceId, pageId }`)** answers `{ page, components }`: `page` is the registered `PageDef` (without `id`, or the preset page without `name`), and `components` is `Array<{ name, owner, def }>` for every composite the page uses, transitively (node types and table columns' `as`), by name. A hidden page is answered. A page id that is not an active page of the workspace fails `NOT_FOUND`.

**Translations (`kernel.ui.translations.get { workspaceId }`)** answers `{ locale, catalogs: Record<owner, Record<locale, Catalog>> }`: `locale` is the saved preference; each active extension with translations, and `preset` with its translations, lists its catalogs for the saved tag, its base language, and its default locale (those it ships), nested as registered. The shell's `t()` walks the chain.

**Errors.** An unknown workspace fails `WORKSPACE_INVALID`; a workspace with no applied preset fails `PRESET_REQUIRED` in all three queries (the shell shows first run, as for `kernel.preset.current.get`, ADR 0149).

**HTTP.** `GET /ui`, `/ui/pages/:pageId`, and `/ui/translations` take `workspaceId` in the query string and answer the query's value. They send `ETag: "<revision>"` (`"<revision>:<locale>"` for translations) and answer `304` without a body when `If-None-Match` lists that tag (weak tags compare equal; `*` matches).

## Consequences

- `@kvman/protocol` gains the request and answer schemas, `label` on `uiItemSchema` and on the `pages` and `settingsSections` entries, and `def` on composite `components` entries (a changeset).
- `08` §8.6 states the shapes, the owners, the sidebar list, the revision, and the errors; `03` §3.8's `kernel.ui.*` rows point here; `12` §12.2 names the ETag forms.
