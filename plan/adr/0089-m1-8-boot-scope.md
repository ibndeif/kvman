# ADR 0089 — What M1.8's boot builds

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.8
- **Decided by**: the product owner

## Question

Boot (`03` §3.9) includes steps whose mechanisms come in later milestones: secrets, snapshot verification, manifest loading, interrupted data migrations, process reconciliation, clearing `once` trust, and the first-run and upgrade work (builtins, presets, the Home workspace).

## Options

1. **Build only the mechanisms that exist now**; each later milestone adds its own step.
2. Add the later steps now as empty hooks.
3. Build only steps 0, 1, 2, and 8, and leave recovery to M1.9.

## Decision

Option 1. M1.8 builds these parts of boot:

- **Step 0.** Home resolution and `HOME_INVALID`. A missing or empty home folder is initialized with mode 0700.
- **Step 1.** The lock (ADR 0088).
- **Step 2.** SQLite and kernel migrations, with `SCHEMA_TOO_NEW`.
- **Step 6.** Recovery of `running` rows (ADR 0091), rebuilt awaiting deadline timers, and the pending index.
- **Step 7.** Lazy hosts.
- **Step 8.** Adapters, then `kernel.started` (transient, `{ version, instanceId }`).
- **Last.** Every boot records `kvman.version` in `kernel_settings`. That version is the `@kvman/kernel` package version, and `/health`, `hello.kernelVersion`, and `kernel.started` report the same value.

Until M2.2 loads installed manifests, the daemon's registry holds the kernel types and the quarantine rows. The later steps land with their mechanisms, and each is named in its milestone's Build list:

| Boot work (`03` §3.9) | Milestone |
|---|---|
| step 4 (snapshot verification), step 5 (manifests into the registry), first-run builtin install | M2.2 |
| step 3 (secrets), the Home workspace at first run | M2.3 |
| step 6: clearing `once` trust | M2.5 |
| step 6: process reconciliation | M2.6 |
| step 5: interrupted data migrations; the upgrade's install and reload of newer builtins | M2.7 |
| built-in preset seeding at first run and upgrade | M2.8 |

## Consequences

`15` M1.8, M2.2, M2.3, M2.5, M2.6, M2.7, and M2.8 name their boot steps.
