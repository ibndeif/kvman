# ADR 0125 — Config values

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.3
- **Decided by**: the product owner

## Question

`07` §7.5 orders resolution as "schema defaults < global < workspace". It does not say:

- how stored values merge, or what a write validates;
- what `kernel.config.get` returns for rows that do not exist, or for an extension without `registerConfig`;
- what `ctx.config.get()` sees after `ctx.config.set` in the same handler.

## Options

- **Merge:**
  1. **By top-level field.**
  2. The most specific whole value wins.
  3. Deep merge.
- **Missing rows:**
  1. **`{ value: {}, revision: 0 }`; no config fails `NOT_FOUND`.**
  2. Nullable rows.
- **Reads:**
  1. **The handler's own pending writes, without secret fields.**
  2. Committed values only.

## Decision

Option 1 in each case.

**Merging.**

- A stored row holds some top-level fields of the config object.
- The merged value is the schema defaults, then the global fields, then the workspace fields. A field that is present replaces the lower one whole.

**Writes.**

- Each write validates the merged value of its own scope against the config schema:
  - a global write: defaults, then global;
  - a workspace write: defaults, then global, then the workspace row.
- A failure is `CONFIG_INVALID`, with one issue per failing field.
- A write whose value carries a secret field fails `CONFIG_INVALID` at that field (ADR 0126).
- A write to a scope the schema's `scope` does not allow fails `CONFIG_INVALID`:
  - `global` allows only global writes;
  - `workspace` allows only workspace writes;
  - `both` allows both.
- `kernel.config.set` compares `revision` with the row's revision. A missing row has revision 0, so the first write sends 0. A mismatch fails `CONFIG_STALE`.
- `ctx.config.set` is a blind write.
- Every write bumps its row's revision and publishes `kernel.config.changed {extension, scope, workspaceId?, revision}`. Workspace writes publish in the workspace; global writes publish without one.

**Targets (follow-up answer).** `kernel.config.set`, `kernel.secret.set`, and `kernel.secret.clear` accept any installed extension that registers config, in any existing workspace, whether it is enabled or not. An unknown workspace fails `WORKSPACE_INVALID`.

**`kernel.config.get {extension, workspaceId?}`:**

- A missing row reads as `{ value: {}, revision: 0 }`. `workspace` is `null` only when no `workspaceId` is given.
- `merged` shows each secret field that is set, redacted.
- An unknown extension fails `NOT_FOUND`. So does an installed extension that never called `registerConfig`, with a detail saying so.

**`ctx.config` inside a handler:**

- `ctx.config.get()` returns defaults, then global, then workspace, with the handler's own pending sets applied first. It never includes secret fields.
- `ctx.config.set(scope, value)` with scope `workspace` and no workspace throws `WORKSPACE_INVALID` (as ADR 0040).
- The config writes are applied in the unit of work (`04` §4.2).

## Consequences

`07` §7.5, `05` §5.8, and `03` §3.8 (`kernel.config.get`, `kernel.config.set`) state these rules.
