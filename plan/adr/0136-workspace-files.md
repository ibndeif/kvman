# ADR 0136 — ctx.files

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.5
- **Decided by**: the product owner

## Question

`05` §5.4 lists `ctx.files: { read, write, list, stat, mkdir, rm, glob }` without signatures, and the kernel catalog has no code for a missing file although `fs` answers `fs/NOT_FOUND` (`10` §10.3). `07` §7.2 refuses anything under `~/.kvman`, while preview workspaces live at `~/.kvman/previews/<name>/` (`07` §7.1).

## Options

- **API:** 1. **`read` returns UTF-8 text; binary files go to a blob**; 2. `read` takes `{ as: 'text' | 'bytes' }`.
- **Codes:** 1. **`NOT_FOUND` for a missing path, `WORKSPACE_ESCAPE` for the home folder**; 2. a new `WORKSPACE_FILE_NOT_FOUND`; 3. `CAPABILITY_DENIED` for the home folder.
- **Home folder:** 1. **refused unless inside the workspace's own root**; 2. refused entirely.

## Decision

Option 1 in every case.

```ts
// paths are relative to the workspace root
read(path): Promise<string>                                  // UTF-8, ≤ 16 MB
write(path, content: string | Uint8Array): Promise<void>     // creates or replaces; creates missing parent folders; ≤ 16 MB
list(path?): Promise<Array<{ name, kind, size }>>            // sorted by name; kind: 'file' | 'directory' | 'symlink' | 'other'
stat(path): Promise<{ kind, size, modifiedAt } | undefined>
mkdir(path): Promise<void>                                   // recursive; no error if it exists
rm(path, { recursive? }): Promise<void>                      // no error if missing; a folder needs `recursive`
glob(pattern): Promise<string[]>                             // Node fs.glob syntax, sorted, ≤ 5,000 matches
```

- `read`, `list`, `stat`, and `glob` need `files.read`; `write`, `mkdir`, and `rm` need `files.write`, and are refused in queries (`CAPABILITY_DENIED`). A handler without a workspace fails `WORKSPACE_INVALID`.
- A path is resolved against the workspace root, normalized, and `realpath`-checked; one that leaves the root, through `..`, an absolute path, or a symlink, fails `WORKSPACE_ESCAPE`. A path in the kvman home folder fails `WORKSPACE_ESCAPE` unless it is inside the workspace's own root, so a preview workspace can use its own folder.
- A missing path fails `NOT_FOUND` for `read` and `list`.
- `read` or `write` over 16 MB fails `PAYLOAD_TOO_LARGE { limit: 'file', max: 16777216 }`; `glob` over 5,000 matches fails `PAYLOAD_TOO_LARGE { limit: 'glob', max: 5000 }`.
- `.kvman/**` is trust-gated for every call (ADR 0137); `glob` skips it while the workspace is not trusted.
- `blobs.put({ workspacePath })` reads through the same jail and gate and needs `files.read`.

## Consequences

`05` §5.4 and `07` §7.2 are corrected; `13` §13.2 widens `NOT_FOUND` to workspace files.
