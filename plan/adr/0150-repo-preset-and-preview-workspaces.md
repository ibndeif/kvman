# ADR 0150 — The repo preset and preview workspaces

- **Status**: accepted
- **Date**: 2026-09-27
- **Milestone**: M2.8
- **Decided by**: the product owner

## Question

**The repo preset.** `07` §7.4 has the shell offer "Apply this folder's preset" and send its JSON to `kernel.preset.apply.stage { workspaceId, json }`. But no API lets the shell learn that `<ws>/.kvman/preset.json` exists, or read it.

**Preview workspaces.** `07` §7.1 does not say:

- what `name` may be;
- what creating an existing name does;
- whether the limits on `dev:` enables bind a person too, or only an extension with `kernel.admin`;
- how "never trusted" is enforced;
- which events creation publishes.

## Options

- **Repo preset:**
  1. **A flag on `kernel.workspace.get`, and a query that reads the file through the trust gate.**
  2. `apply.stage { workspaceId, repo: true }`, where the kernel reads the file.
  3. A general file query limited to `.kvman/preset.json`.
- **Preview workspaces:**
  1. **Strict and fail closed.**
  2. The same, but creating an existing name replaces it.
  3. The limits bind extensions only.

## Decision

Option 1 in each case.

**The repo preset**

- `kernel.workspace.get` gains `repoPreset: boolean`. It is true when the workspace is trusted and `<ws>/.kvman/preset.json` exists.
- A new query, `kernel.workspace.preset.get { workspaceId } → { json }`, open to any caller, reads the file through the trust gate (`07` §7.2), re-checked on every read. It fails:
  - `WORKSPACE_UNTRUSTED` when the gate is closed;
  - `NOT_FOUND` when the file is absent;
  - `PRESET_INVALID` when the file is not JSON.
- The shell then sends the JSON to `kernel.preset.apply.stage { workspaceId, json }`, and one Confirm imports and applies it. Nothing is applied silently.

**Preview workspaces**

- **Request.** `kernel.workspace.preview.create { name, from }`:
  - `name` matches `^[a-z0-9-]{1,64}$` (`VALIDATION_FAILED` otherwise);
  - an existing preview of that name fails `WORKSPACE_INVALID` (the builder forgets it first);
  - `from` must be a workspace with an applied preset: an unknown one fails `WORKSPACE_INVALID`, one without a preset `PRESET_REQUIRED`.
- **Creation.** The kernel creates `~/.kvman/previews/<name>/` (mode 0700) and a `workspaces` row of kind `preview`, named `<name>`. Its applied preset is a copy of `from`'s at `revision` 1, with the same extensions and grants. `from`'s `workspace_config` rows are copied at revision 1.
- **Events.** It publishes `kernel.workspace.opened` without a workspace, and `kernel.preset.changed { cause: 'apply' }` in the new workspace.
- **Dev limits.** They bind every enable of a `dev:` source in a preview workspace, including a person's:
  - sandboxed isolation only;
  - never `process`, `network`, or `kernel.admin`;
  - a grant that would need one of them fails `CAPABILITY_DENIED`.

  An extension with `kernel.admin` may enable only `dev:` sources, and only in a preview workspace. A person may enable any source there, under the normal rules for non-`dev:` sources.
- **Trust.** `kernel.trust.preview` and `kernel.trust.grant` on a preview workspace fail `WORKSPACE_INVALID`.
- **Forget.** `kernel.workspace.forget` of a preview workspace may be sent by an extension with `kernel.admin`. After its unit commits, the folder is deleted.
- **Access.** `kernel.extension.enable` and `kernel.workspace.forget` therefore register access `all`, and their handlers allow:
  - a person always;
  - an extension with `kernel.admin` only in a preview workspace, as above;
  - any other caller fails `CALLER_NOT_ALLOWED`.

## Consequences

- `07` §7.1, §7.2, and §7.4 "Repo preset", `06` §6.4, and `03` §3.8 state these rules.
- `@kvman/protocol` gains the new query's schemas and the `repoPreset` field.
