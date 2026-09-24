# ADR 0034 — Rows of failed sends; kvman's own dependency builds

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.1
- **Decided by**: the product owner (1); the implementer, following ADR 0001 (2)

## Questions and decisions

1. A send with `onReply` that fails admission is stored "as a command already `failed`" (`04` §4.2), but `messages.handler` is `NOT NULL` and a type that is not found has no handler. **`handler` holds the owning extension when the type resolved, and `''` when it did not** (`TYPE_NOT_FOUND`).
2. pnpm 12 fails `pnpm install` on dependency build scripts that are neither allowed nor denied, and it treats `better-sqlite3` as having one (npm implies `node-gyp rebuild` for a package with `binding.gyp`). `better-sqlite3` 13 ships prebuilt binaries (ADR 0001), so **its build is denied** in `pnpm-workspace.yaml` (`allowBuilds: { better-sqlite3: false }`) and no compiler runs at install.

## Consequences

`04` §4.1 notes the `handler` value.
