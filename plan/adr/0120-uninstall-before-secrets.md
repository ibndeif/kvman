# ADR 0120 — Uninstall before the secrets file exists

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.2
- **Decided by**: the product owner

## Question

`06` §6.8: uninstall with `deleteData` removes the extension's secrets from `secrets.json` after the commit. M2.3 builds the secrets file.

## Options

1. **M2.3 adds secrets removal.**
2. M2.2 writes the removal now.

## Decision

Option 1.

**M2.2's `kernel.extension.uninstall {name, deleteData?, keepSnapshots?}`:**

- It fails `EXT_IN_USE`, listing the workspaces, while the extension is enabled in any workspace (the runtime's `enabled` input until M2.3).
- In one transaction it:
  - marks every unfinished message handled by the extension `cancelled`, and waiters get `CANCELLED`, but `onAbort` is not sent;
  - deletes the `extensions` and `extension_versions` rows;
  - publishes `kernel.extension.uninstalled {name}`.
- With `deleteData` it also deletes, in the same transaction:
  - the extension's kv, docs, and logs rows, and its blob refs;
  - its `global_config` row, `workspace_config` rows, and `schema_versions` row;
  - its notifications (source `ext:<name>`) and its `llm_models` rows;
  - its entry in every applied preset. Each changed preset gets a revision bump and a `kernel.preset.changed {workspaceId, revision, cause: 'disable'}` event.
- After the commit, the snapshots are removed unless `keepSnapshots` is set. Running invocations of the extension are aborted.

M2.3 adds removing the extension's secrets from `secrets.json` after the commit (`04` §4.7).

## Consequences

- `15` M2.3's Build line names secrets removal on uninstall.
- `15` M2.2 cites this ADR.
