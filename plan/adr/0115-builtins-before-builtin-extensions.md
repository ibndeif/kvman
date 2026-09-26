# ADR 0115 — Builtin tarballs before any builtin extension exists

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.2
- **Decided by**: the product owner

## Question

`15` M2.2 has two Done-when bullets: "`pnpm build` produces the builtin tarballs and `digests.json`" and "first run succeeds with the network disabled". But no `extensions/*` package exists until M4.1.

Node 24's permission model also has no network switch. How does a test prove "network disabled"?

## Options

Builtins:
1. **Fixture folder.** `pack-builtins` packs every `extensions/*` package; its tests run it on a fixture folder.
2. **A sample builtin.** Add a tiny real extension now, which would then ship in every release.

Network:
1. **Unreachable endpoints.**
2. **A Linux network namespace** (`unshare -rn`).

## Decision

Option 1 for both.

**`scripts/pack-builtins`:**

- It runs in `pnpm build` after the packages build. It takes an extensions folder and an output folder; by default these are `extensions/` and `packages/kernel/builtin/`.
- Each package gets one self-contained tarball, `packages/kernel/builtin/<package name with "@" removed and "/" replaced by "-">.tgz`.
- The tarball holds the tree a staging install would produce: `node_modules/<name>/` plus its production dependencies, hoisted.
- `digests.json` maps each package name to `{ file, digest }`. `digest` is the snapshot digest of the unpacked tree.
- With no extensions, `digests.json` is `{}`.

**Tests:**

- The pack tests run `pack-builtins` on fixture extension folders.
- The first-run tests boot a kernel whose builtin folder holds those packed fixtures. The builtin folder is a boot option, and the daemon defaults it to the kernel package's `builtin/`.

**First run offline.** A child kernel boots on a fresh home with `KVMAN_NPM_REGISTRY`, `HTTP_PROXY`, and `HTTPS_PROXY` pointing at a closed local port. The test asserts three things:

- every builtin installs, verifies, and loads;
- pnpm never started;
- no staging tree is left behind.

**A builtin that fails to install on first run** (the implementer's recommendation, taken when the product owner declined the question and said to continue): boot refuses to start with that builtin's problem. Before exiting, it:

- closes the database and removes it, so the next start is a first run again;
- releases the lock.

A broken kvman package is never half installed.

## Consequences

- `06` §6.9 names the tarball file names and the contents of `digests.json`.
- `15` M2.2 cites this ADR.
