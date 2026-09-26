# ADR 0114 — How tests get installed extensions

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.2
- **Decided by**: the product owner

## Question

From M2.2, the registry and the hosts read installed extensions from the database and their code from snapshots. Until now they received manifests and entry files as data (ADR 0089).

Hundreds of existing tests pass fixture manifests and `.ts` entry files. How do they get their extensions now?

## Options

1. **A test install helper.** The testkit writes real snapshots through the kernel's own install step, recording `setup` in-process.
2. **The full pipeline everywhere.** Every test stages and installs, loader process included.
3. **The runtime keeps taking data.** Only the daemon reads the database.

## Decision

Option 1.

**What the kernel reads:**

- The registry reads every installed extension from `extensions` joined with the `extension_versions` row of its `active_digest`.
- A host loads an extension from `extensions/snapshots/<digest>/`.
- `ExtensionModules` and `RegistryInput.extensions` are removed.

**What stays data:**

- Until M2.3, the workspaces that enable each extension stay a runtime input (`enabled`).
- Until M2.3 and M2.4, grants stay a runtime input (`grants`).

**The test helper.** The testkit helper writes snapshots with the kernel's exported install step, which is the same function `kernel.extension.install` runs:

1. It packs a fixture into a package folder, turning TypeScript into JavaScript with `node:module`'s `stripTypeScriptTypes`.
2. It records `setup` in the test process.
3. It builds the file list and the digest.
4. It moves the tree into `snapshots/<digest>/` and writes the `extensions` and `extension_versions` rows.

The helper skips the checks of stage steps 2 and 4 (the loader process). Those checks have their own M2.2 tests.

## Consequences

- The M1 test harnesses install their fixtures with the helper, and so do the child kernel, the benchmarks, and the schema fixture.
- `15` M2.2's Build line cites this ADR.
