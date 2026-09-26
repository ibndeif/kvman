# ADR 0124 — How tests get applied presets

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.3
- **Decided by**: the product owner

## Question

From M2.3, enable needs an applied preset (`PRESET_REQUIRED`), and the kernel reads enabled extensions from applied presets (ADR 0123). Presets are applied only from M2.8. How do the existing tests, and M2.3's own tests, get a workspace with an applied preset?

## Options

1. **A testkit helper writes the rows** through an exported kernel storage function.
2. The helper writes an empty preset, and every test enables its extensions with `kernel.extension.enable`.

## Decision

Option 1, following the pattern of ADR 0114.

- The kernel exports the storage function that writes a `workspaces` row and a `workspace_presets` row. M2.8's apply will use the same function.
- The testkit helper uses that function to write the workspace (with its canonical path) and an applied preset at revision 1. For each fixture extension to enable, it adds an entry built from the installed version: `source`, `integrity`, `digest`, `enabled: true`, and grants equal to the manifest's requests with the isolation the test asks for.
- M2.3's own enable and disable tests start from an applied preset with no extensions and use the real commands.

## Consequences

The M1 and M2 harnesses, the child kernel, the benchmarks, and the schema fixture enable their extensions through the helper, instead of passing `enabled` and `grants`.
