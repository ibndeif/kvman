# ADR 0168 — Developer docs in M2.13: the guide, its examples, and the TypeDoc check

- **Status**: accepted
- **Date**: 2026-09-29
- **Milestone**: M2.13
- **Decided by**: the product owner

## Question

`14` §14.5 says `docs/extension-guide.md` opens with "your first extension in 10 minutes": `kvman ext new` → `kvman ext dev --watch` → edit a command and see it in the shell → `npm test` → `npm publish`, and that CI runs these steps.

- The CLI arrives in M2.14 and the shell in M3, so these steps cannot run in M2.13.
- It also says a public SDK export without a doc comment fails the build, without saying whether members count or where `docs/api/` lives.

## Options

- **Guide:**
  1. **Write the guide now, run its examples now, and test the walkthrough in M2.14 and M3.**
  2. Move the whole guide to M2.14.
  3. Write a walkthrough without the CLI, rewritten later.
- **TypeDoc:**
  1. **Exports and their members; `docs/api/` generated and git-ignored.**
  2. Exports only.
  3. Exports and members, with `docs/api/` committed.

## Decision

Option 1 in each case.

**Guide**

- M2.13 writes:
  - `docs/extension-guide.md`, the 10-minute walkthrough and the guide to the extension API and the testkit;
  - `docs/naming.md`, the one-page cheat sheet of `14` §14.5.
- Every code example in the guide lives in a project under `examples/`, and the guide quotes it. Their tests use `createTestKernel` and run in `pnpm test` in both modes (ADR 0165).
- Running the walkthrough (`kvman ext new` → `kvman ext dev` → `npm test` → `npm publish` to the local registry) becomes a *Done when* of M2.14. "See it in the shell" becomes one of M3.

**TypeDoc**

- TypeDoc (latest, pinned exactly) is a root dev dependency.
- `pnpm build` runs it over `@kvman/sdk` and `@kvman/widget-bridge`, writing `docs/api/`, which is git-ignored.
- Its `notDocumented` validation covers every exported declaration and its members (properties, methods, and accessors), with warnings treated as errors. A missing doc comment fails the build.

## Consequences

- `14` §14.5, and the *Done when* of M2.13 and M2.14 in `15` §15.4, are corrected.
- `.gitignore` gains `docs/api/`.
