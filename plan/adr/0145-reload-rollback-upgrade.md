# ADR 0145 — Reload, rollback, and the upgrade boot path

- **Status**: accepted
- **Date**: 2026-09-27
- **Milestone**: M2.7
- **Decided by**: the product owner

## Question

`06` §6.6–§6.7, `03` §3.6, §3.9, and ADR 0089 leave these open:

- **Upgrade:** how the upgrade boot path applies bundled builtins.
- **Enabled nowhere:** what a reload does for an extension enabled in no workspace. Migrations run at "the most isolated level granted across the workspaces where it is enabled", an empty set here.
- **Quarantine:** which successful reloads clear a quarantine.
- **Drain:** whether an invocation aborted after the 10 s drain counts an attempt.
- **Shell retry:** how to prove "a query during a reload is retried by the shell" before the shell exists (M3).
- **Memory:** how "the pool's memory returns to its baseline" is measured.
- **Grants:** the rules for `grants` and the `params` of `EXT_GRANTS_REQUIRED`.
- **Rollback:** which digests it can target, and what a reload to a lower data version answers.

## Options

- **Upgrade:**
  1. **Install every new tarball; activate those with a higher version.**
  2. Always switch to the bundled version.
  3. Install only.
- **Clearing:**
  1. **Any successful reload.**
  2. Only the action the table names.
- **Drain:**
  1. **No attempt counted, and the shell's retry moves to M3.**
  2. Counts an attempt.
  3. A retrying testkit client now.
- **Memory:**
  1. **Workers gone, plus heap within 10 MB.**
  2. RSS within 10%.
  3. Worker count only.
- **Grants:**
  1. **All or nothing, like enable.**
  2. Only where needed.
- **Params:**
  1. **Per workspace.**
  2. Flat.
- **Rollback:**
  1. **Any installed digest, with the same data rule.**
  2. Older digests only.

## Decision

Option 1 in each case.

**Upgrade boot path** (`03` §3.9: the recorded `kvman.version` is older than the running kernel)

- After boot step 5, every bundled builtin tarball whose digest is not installed is installed as a new version (source `builtin:<name>`).
- If its package version is higher than the active version's, it becomes active:
  - where it is enabled somewhere, through a reload by the kernel, without `grants`. A reload that needs new capabilities records `pending_digest` ("needs approval").
  - where it is enabled nowhere, by switching `active_digest`.
- A builtin new to this release is installed like at first run.
- Any other failure of one builtin is logged, and boot continues.

**Extension enabled nowhere.** A reload or rollback:

- validates the target;
- applies the data rule below;
- switches `active_digest` in one unit of work, clearing `pending_digest`, `migrating`, and a quarantine.

It runs no migration. Stored data older than the code migrates at the next enable. It publishes no `kernel.extension.reloaded`.

**Quarantine**

- Any successful reload or rollback of a quarantined extension clears the quarantine, for any reason, and publishes `kernel.extension.unquarantined {name}`.
- A reload of the same digest after `EXT_INTEGRITY` still fails, because the rehash fails again.

**Drain.** Invocations still running 10 s after dispatch stops are aborted. They return to `pending` without counting an attempt, as at shutdown (ADR 0091), and run on the new version.

**Queries during a reload.** A query fails `HANDLER_UNAVAILABLE` with `retryAfterMs: 1000`. M2.7 proves the kernel's half: the same query sent after that delay, once the reload is done, succeeds. The shell's automatic retry is proven in the shell milestone that builds query calls (M3.2).

**Memory.** In a child kernel started with `--expose-gc`, after 20 reloads of a shared extension:

- every replaced shared worker has exited;
- the pool holds no more workers than before;
- the daemon's `heapUsed` after a forced GC is within 10 MB of the baseline taken after the first reload.

**Grants**

- Each workspace's entry in `grants` must equal what the target version requests (enable's validity check; `CAPABILITY_DENIED` lists what is missing and unexpected).
- An entry for a workspace where the extension is not enabled fails `VALIDATION_FAILED`.
- An entry for an enabled workspace that needs no new grant is accepted and replaces its grants.
- A workspace without an entry keeps its grants, minus capabilities the target no longer requests.

**`EXT_GRANTS_REQUIRED` params**

```ts
params: {
  digest: '<target digest>',
  workspaces: [
    { workspaceId: 'a1…', missing: ['process', 'calls: fs.file.get'], isolation: 'shared requested, sandboxed granted' },
    { workspaceId: 'b2…', missing: ['process'] },
  ],
}
```

The labels are enable's; `isolation` appears only when isolation is not granted.

**Rollback**

- `kernel.extension.rollback {name, digest}` accepts any installed digest of the extension, else `NOT_FOUND`. Rolling back to the active digest is a plain reload.
- The target snapshot is rehashed first. A mismatch fails `EXT_INTEGRITY` without quarantining, because the active version is intact.
- Rollback and reload both fail `EXT_ROLLBACK_BLOCKED`, with `params { stored, target }`, when the target's data version is below the stored one and does not cover it (ADR 0142).

## Consequences

- `03` §3.6 states the clearing rule.
- `03` §3.9 states the upgrade path.
- `06` §6.6 states the drain, the grants rules, the params, and the case of an extension enabled nowhere.
- `06` §6.7 states the rollback targets.
- `13` §13.2 names the params.
- `15` M2.7 and the shell milestone (M3.2) move the shell's retry.
