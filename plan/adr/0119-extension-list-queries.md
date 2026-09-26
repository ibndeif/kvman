# ADR 0119 — `kernel.extensions.list` and `kernel.extension.get` in M2.2

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.2
- **Decided by**: the product owner

## Question

`03` §3.8 defines `kernel.extensions.list` and `kernel.extension.get`, but no milestone builds them. Three things are also open: the shape of "isolation per workspace", the code for an unknown name, and where the fields of later milestones come from.

## Options

Milestone:
1. **M2.2.**
2. M2.3.
3. M2.14.

Isolation:
1. **A record keyed by workspace.**
2. An array of `{ workspaceId, mode }`.

Unknown name:
1. **`NOT_FOUND`.**
2. `EXT_SOURCE_INVALID`.

## Decision

Option 1 for each question.

**Where they land.** Both queries land in M2.2, with access `all`. `enabledIn`, `isolation`, and `grants` come from the same runtime inputs as the registry until M2.3 and M2.4 (ADR 0114).

**`kernel.extensions.list {workspaceId?}`** returns one entry per installed extension, sorted by name:

```
{ name, title, icon?, description, version, namespace, activeDigest, status: 'active' | 'quarantined' | 'needs-approval',
  quarantineReason?, isolation: Record<workspaceId, 'shared' | 'dedicated' | 'sandboxed'>, enabledIn: workspaceId[] }
```

- Every field comes from the active version's manifest and the `extensions` row.
- `status` is `needs-approval` when `pending_digest` is set and the extension is not quarantined.
- With `workspaceId`, only the extensions enabled there are listed. An unknown workspace fails `WORKSPACE_INVALID` (ADR 0111).

**`kernel.extension.get {name}`** returns:

```
{ versions: [{ digest, source, version, installedAt }], manifest, grants: Record<workspaceId, Capabilities> }
```

- `versions` is sorted by `installedAt`, newest first.
- `manifest` is the active version's.

**Unknown name.** For both `get` and `uninstall`, a name that is not installed fails `NOT_FOUND` with "no extension <name> is installed". The catalog description of `NOT_FOUND` becomes "An unknown message id, route, or extension, or a subscription for a stream with no open connection."

## Consequences

- `15` M2.2's Build line lists both queries.
- `03` §3.8 shows the isolation record.
- `13` §13.2 extends the `NOT_FOUND` row.
