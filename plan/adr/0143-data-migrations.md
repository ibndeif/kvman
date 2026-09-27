# ADR 0143 — Data migrations: `m`, the config check, and the step limit

- **Status**: accepted
- **Date**: 2026-09-27
- **Milestone**: M2.7
- **Decided by**: the product owner

## Question

`04` §4.8 leaves these open:

- **The bulk calls:** `m` offers "bulk iterate/patch over the extension's own kv, collections, and logs (every workspace and global)", and ADR 0050 left the shape for M2.7.
- **The config check:** it runs "after the migrations", and each step commits in its own unit of work. A failing check can therefore find the data already at the new version while the old version stays active.
- **Time limit:** no step has one, so a hung step would hold the enable or reload, and the extension's dispatch, forever.

## Options

- **Shape:**
  1. **`each()` callbacks** driven by the kernel.
  2. Scoped stores (`m.store(scope)`, `m.scopes()`, `m.logKeys()`).
  3. Both.
- **Config check:**
  1. **Inside the last step's unit of work.**
  2. After all steps, as a part-way failure.
- **Step limit:**
  1. **10 minutes.**
  2. 1 hour.
  3. None.
- **What `each` sees:**
  1. **Committed data, in a stable order.**
  2. Also the step's own earlier writes.

## Decision

Option 1 in each case.

**The migration context**

```ts
up: async (m) => {
  await m.kv.each(async ({ workspaceId, key, value }) => (key.startsWith('old:') ? m.remove : undefined));
  await m.collection('files').each(async ({ workspaceId, doc }) => ({ ...doc, pages: doc.pageCount }));
  await m.log('history:*').each(async ({ workspaceId, key, seq, value }) => ({ ...value, v: 2 }));
  const stored = await m.config.get('global');
  if (stored !== undefined) m.config.set('global', { ...stored, model: 'x' });
}
```

- **The calls:** `m.kv.each(fn)`, `m.collection(name).each(fn)`, and `m.log(name).each(fn)` visit the extension's own data in every workspace and global. `workspaceId` is `null` for global data.
  - `m.collection` takes a collection it registers.
  - `m.log` takes a log it registers or a family (`history:*`). A family visits every key, with `key` naming it.
  - `m.log` on a plain log has no `key`.
- **What the callback returns:**
  - a value, which replaces the entry when the step commits;
  - `undefined`, which keeps it;
  - `m.remove`, which deletes a kv entry, a document, or one log entry. Log seqs are never renumbered.
- **Documents:** a replaced document must still match its collection's schema and keep its id, else the step fails `VALIDATION_FAILED`.
- **Order and visibility:**
  - `each` visits the data as committed when the step started, not the step's own earlier writes.
  - Order: global first, then workspaces by id. Within each, keys, document ids, and seqs ascend; family keys ascend too.
  - The kernel streams it to the host in internal batches, so there is no size cap.
- **Config:** `m.config.get` and `m.config.set` are as in ADR 0050. `get` also sees the step's own `set`s.
- **Other data:** blobs, secrets, and other extensions' data are out of reach.

**Running the steps**

- A step is extension code. Every migration (at enable, reload, or boot) runs in a host of its own, loaded with the target digest's code, which stops when the migration ends; the extension's normal hosts start lazily on its next message. Old and new code never share a host. (Asked when the code was written: `03` §3.9 had boot's migration hosts stay up until the idle unload.)
- The isolation is the most isolated of those granted where the extension is enabled or being enabled.
- Each step `to: n` commits its writes, its config writes, and the stored version `n` in one unit of work.

**The config check**

- The check of every stored config value against the target's config schema runs inside the last step's unit of work. It covers the extension's `global_config` row and every `workspace_config` row, with that step's own writes applied.
- A failing check discards that step exactly as a failing migration would:
  - if no step committed, the data is unchanged and the old version stays active;
  - otherwise the part-way rule of `04` §4.8 applies.
- Either way the command fails `CONFIG_INVALID`, listing each field and workspace.
- With no steps to run, the check runs at once and writes nothing.

**Resumed migrations and shutdown** (consequences of `04` §4.8 as written)

- `migrating` does not record the version a migration started from, so a migration resumed at boot is treated as one whose earlier steps committed: if it fails, the extension is quarantined `MIGRATION_FAILED` unless the active version covers the version reached. This is the fail-closed reading.
- A step still running when the kernel shuts down ends with `KERNEL_STOPPING`. `migrating` is left for boot to resume, and the enable or reload command stays running, so it is redelivered at the next start (ADR 0091).
- A reload redelivered after a crash, whose digest is already active with no migration recorded, finds the swap boot performed and replies without changes.

**Step limit**

- A step still running after 10 minutes is aborted and counts as a failing step (`MIGRATION_FAILED`, with the part-way rule).
- After a further 2 s its host is treated as stuck (`03` §3.6) and replaced. This is not charged as a host failure.
- A host that crashes during a step also fails the step, without a charge.

## Consequences

- `@kvman/sdk` gains the `MigrationContext` members above.
- `@kvman/protocol` gains the frames and calls that carry a step between the kernel and a host.
- `04` §4.8 states the shape, the check inside the last step, the limit, and the migration host.
- `03` §3.9 steps 5 and 7 no longer keep boot's migration hosts running.
- ADR 0050 is complete.
