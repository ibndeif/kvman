# ADR 0137 — The trust gate

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.5
- **Decided by**: the product owner

## Question

`07` §7.2 says a changed file "closes the gate again until a new preview is confirmed" without saying what happens to the stored record, says a symlinked file closes the gate without saying what a preview does with one, and puts no cap on a preview.

## Options

- **Closing:** 1. **clear the record**; 2. keep it and recheck on every read and list.
- **Symlinks:** 1. **the preview fails**; 2. the preview leaves them out and the gate stays shut.
- **Cap:** 1. **1,000 files and 64 MB**; 2. none.

## Decision

Option 1 in every case.

- When a read of `.kvman/**` finds a file added, removed, changed, or turned into a symlink, or a `ctx.files` write lands under `.kvman/`, the kernel sets the workspace's `trust` to `NULL` and publishes `kernel.trust.changed { workspaceId, trusted: false }` once. Reads fail `WORKSPACE_UNTRUSTED` until a new preview is granted. `trusted` in `kernel.workspaces.list` is "a record is stored".
- `kernel.trust.preview` fails `WORKSPACE_UNTRUSTED` with a hint naming the entry when `.kvman/` holds a symlink or anything that is not a regular file or a folder.
- A preview over 1,000 files or 64 MB in total fails `PAYLOAD_TOO_LARGE { limit: 'trust', max }` (`max` is 1000 or 67108864), with a hint.
- The token is an HMAC with a per-boot key over the workspace, the files' digest, and the expiry (10 minutes). A grant whose token is expired, forged, or for files that changed fails `CONFIRMATION_EXPIRED`, like the stage tokens.
- The size, modification time, and inode of each trusted file are kept in memory; after a restart the first read rehashes.

## Consequences

`07` §7.2 is corrected.
