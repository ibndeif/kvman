# ADR 0127 — Opening workspaces, their queries, and the Home workspace

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.3
- **Decided by**: the product owner

## Question

`07` §7.1 does not say:

- which path forms `kernel.workspace.open` accepts;
- what a new workspace is named, or which names `rename` accepts;
- how "folder not found" reaches anyone, since M2.3's Build names no workspace query;
- whether the Home workspace can be forgotten;
- what happens when first run cannot create `~/kvman`.

## Options

- **Rules:**
  1. **Absolute paths; the folder's basename; names of 1–100 characters.**
  2. The same without a name limit.
- **Queries:**
  1. **`kernel.workspaces.list` and `kernel.workspace.get` in M2.3; Home can be forgotten.**
  2. The same, but Home is protected.
  3. Also `kernel.preset.current.get`.
- **Home failure:**
  1. **First run fails.**
  2. Continue without a Home workspace.

## Decision

Option 1 in each case.

**`kernel.workspace.open {path}`:**

- `path` must be absolute, else `VALIDATION_FAILED`. The CLI resolves relative paths itself.
- The canonical path is `fs.realpath.native(path)`, and the id is the SHA-256 of it (`07` §7.1).
- A path that does not exist, is not a directory, or is inside the kvman home folder (or is that folder) fails `WORKSPACE_INVALID`.
- A new workspace is named after the canonical folder's basename, so the Home workspace is `kvman`. Reopening keeps the name.
- Every open publishes `kernel.workspace.opened`, new or not (ADR 0122).

**`kernel.workspace.rename {workspaceId, name}`:** `name` is trimmed and must have 1–100 characters (`VALIDATION_FAILED`). An unknown workspace fails `WORKSPACE_INVALID`.

**Queries.** M2.3 adds:

- `kernel.workspaces.list {includePreview?}`: sorted by name (code-point order), ties by canonical path (follow-up answer). `exists` comes from a stat at query time, and `trusted` is `false` until M2.5.
- `kernel.workspace.get {workspaceId}`: `trust` is `null` until M2.5.

`kernel.preset.current.get` waits for M2.8.

**The Home workspace** is an ordinary workspace. It can be forgotten, and it is not recreated after first run.

**First run** creates `~/kvman` (the operating system's home folder) and opens it. If it cannot be created or opened (a file is in the way, for example), first run fails as a builtin failure does: `kvman.db` is removed and the lock is released (ADR 0115).

## Consequences

`07` §7.1, `03` §3.8 (the workspace commands and queries), and `15` M2.3's Build state these rules.
