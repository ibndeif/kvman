# ADR 0146 — Built-in presets before their extensions exist

- **Status**: accepted
- **Date**: 2026-09-27
- **Milestone**: M2.8
- **Decided by**: the product owner

## Question

`15` M2.8 builds "the catalog with built-in seeding at first run and upgrade" (ADR 0089). But every preset of `07` §7.6 needs extensions that arrive only in M4 and M5 (the agent pack and the platform pack). The plan also does not say:

- where built-in presets live;
- how a `builtin:` entry gets its integrity (`builtin:<kvman version>`);
- what an upgrade does with built-ins that changed, were added, or were removed.

## Options

1. **The mechanism, with none shipped**: preset JSON files packed next to the builtin tarballs, seeded from a folder; tests use fixture folders (as ADR 0115 does for tarballs).
2. The same mechanism, plus a Minimal preset with no extensions now.
3. Built-in presets as TypeScript constants in the kernel.

## Decision

Option 1.

**Source and packing**

- Built-in presets are authored as JSON in `presets/` at the repository root, one file per preset, named `<id>.json`.
- `scripts/pack-builtins` copies each file into `packages/kernel/builtin/presets/<id>.json`, after checking it against the preset schema. It sets the `integrity` of every `builtin:` entry to `builtin:<kvman version>` (the kernel package version).
- With no files, the folder is empty. No preset ships until the extensions it names exist.

**Seeding**

- The kernel seeds from a presets folder. This is a boot option, and the daemon defaults it to the kernel package's `builtin/presets/`.
- **First run** (`03` §3.9): after the builtin extensions are installed, every file becomes a catalog row with `builtin = 1`. Each publishes `kernel.preset.catalog.changed { presetId, cause: 'seed' }`.
- **Upgrade** (a newer kvman than `kvman.version`, after the builtin extensions are upgraded):
  - every bundled preset is written again;
  - a built-in row that is no longer bundled is deleted;
  - a catalog entry that is not built-in but has a bundled preset's id is replaced by it, because built-in ids are reserved;
  - each written or deleted row publishes `kernel.preset.catalog.changed { cause: 'seed' }`, including deletions;
  - applied copies are never touched.
- A file that does not parse as a preset refuses a first run, like a failing builtin tarball (ADR 0115). On an upgrade it is logged and skipped.

## Consequences

- `07` §7.4 "Catalog" and §7.6, `03` §3.9, and `06` §6.9 name the folder and the rules.
- The first-run and upgrade tests boot kernels with fixture preset folders.
