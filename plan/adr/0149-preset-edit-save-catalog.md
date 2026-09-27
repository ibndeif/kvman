# ADR 0149 — Preset edits, save-as ids, and catalog rules

- **Status**: accepted
- **Date**: 2026-09-27
- **Milestone**: M2.8
- **Decided by**: the product owner

## Question

`07` §7.4 leaves these open:

- **Patchable keys:** which top-level keys a `kernel.preset.update` patch may touch.
- **Enabled:** what turning `enabled` on or off through a patch does.
- **Save-as ids:** how the id is derived when a name has no Latin letters. Read literally, "مترجم" becomes `-----`.
- **Catalog:** ordering, revisions, and the codes for unknown ids and for workspaces without a preset.

## Options

- **Patch:**
  1. **The listed keys; turning `enabled` on or off acts like enable or disable.**
  2. The same, plus `name`, `description`, and `icon`.
- **Save-as id:**
  1. **Collapse runs of other characters, trim dashes, and fall back to `preset`.**
  2. The literal rule.
- **Catalog:**
  1. **The rules below.**
  2. Catalog revisions count replacements.

## Decision

Option 1 in each case.

**`kernel.preset.update { workspaceId, patch, revision }`**

- **Keys.** A patch may touch `app`, `layout`, `hidden`, `labels`, `pages`, `navGroups`, `nav`, `translations`, and `extensions`.
  - `config` fails `PRESET_INVALID`, as `07` §7.4 says.
  - So does any other key: `id`, `presetVersion`, `revision`, `name`, `description`, `icon`, `llm`.
- **Order of checks.**
  - An unknown workspace fails `WORKSPACE_INVALID`.
  - A workspace with no applied preset fails `PRESET_REQUIRED`.
  - A stale `revision` fails `PRESET_STALE`.
  - The merged result is checked against the preset schema (`PRESET_INVALID`).
- **`extensions`** (the `07` §7.4 limits):
  - Only entries already present may be patched, and only `enabled`, `grants`, and `disable`. Anything else fails `PRESET_INVALID`.
  - Such a patch is a grant command: from any source but a person it fails `CALLER_NOT_ALLOWED`.
  - Turning `enabled` on runs the checks, data migrations, and config check of `kernel.extension.enable`, with the entry's grants.
  - Turning it off fails `EXT_IN_USE` while another enabled extension requires it.
  - Changed `grants` must equal what the extension requests and derives, plus an allowed isolation (`CAPABILITY_DENIED` otherwise).
- **Events.** Each entry turned on or off, or whose grants changed, publishes `kernel.extension.enabled` or `.disabled`. The write publishes `kernel.preset.changed { cause: 'update' }`.

**`kernel.preset.save { workspaceId, name, description? }`**

- **Id.**
  1. Lowercase the name.
  2. Replace each run of characters outside `a-z0-9` with one `-`.
  3. Remove leading and trailing `-`; an empty result becomes `preset`.
  4. Cut the base so that it and any suffix fit in 64 characters.
  5. Append `-2`, `-3`, … until the id is free. Built-in ids count as taken.
- **Content.**
  - The saved entry is the applied copy, with the given `name` and `description` and the derived `id`.
  - It gets `revision` 1, drops local `digest`s, and takes its `config` from the workspace's `workspace_config` rows.
- **Check.** It then passes the import check (ADR 0147), so a `dev:` or `local:` entry fails `PRESET_UNSHAREABLE`.
- **Event.** It publishes `kernel.preset.catalog.changed { cause: 'save' }`.

**Catalog**

- `kernel.presets.list` sorts by name (by code point), then by id.
- An unknown `presetId` fails `NOT_FOUND` in `get`, `export.get`, `delete`, and `apply.stage`.
- `kernel.preset.current.get` and `export.get { workspaceId }` for a workspace with no applied preset fail `PRESET_REQUIRED`.
- A catalog entry's `revision`:
  - an imported JSON keeps its own;
  - save-as writes 1;
  - a built-in has its file's.
- `kernel.preset.export.get` removes every `digest` and fails `PRESET_UNSHAREABLE` for a `dev:` or `local:` entry. For a workspace, its `config` comes from the `workspace_config` rows.
- `digest` appears only in applied copies and in `kernel.preset.current.get`.
- Deleting a built-in fails `PRESET_READONLY`, and so does importing one's id (`07` §7.4).

## Consequences

`07` §7.4 "Ids", "Edit", "Save as", "Export", and "Delete", and `03` §3.8, state these rules.
