# ADR 0113 — Dependencies of the install pipeline

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.2
- **Decided by**: the product owner

## Question

`06` §6.2 and `15` M2.2 name pnpm, es-module-lexer, and Verdaccio. Two more things are needed:

- unpacking the builtin `.tgz` tarballs, and writing them in `scripts/pack-builtins`;
- checking a `peerDependencies['@kvman/sdk']` range against the running SDK.

A third question came up while adding pnpm. `06` §6.2 says the bundled pnpm runs "with the kernel's own Node", but pnpm 12, the latest line, ships as a native executable. pnpm 11 is the last line that runs on Node.

## Options

Tarballs:
1. **`tar`**, npm's own package.
2. A ustar reader and writer written in the kernel.
3. Builtins as plain folders instead of tarballs.

Ranges:
1. **`semver`**, npm's own package.
2. A range matcher written in the kernel.

pnpm:
1. **pnpm 12's native executable.**
2. Hold pnpm at 11.x and run it with Node.

## Decision

Option 1 for each question.

- **`tar`** is a kernel dependency. It unpacks the builtin tarballs, and `scripts/pack-builtins` writes them with it.
- **`semver`** is a kernel dependency, and `@types/semver` a kernel dev dependency.
- **pnpm 12.**
  - The kernel spawns the executable from the `@pnpm/exe.<platform>` package that `pnpm` installs as an optional dependency. The kernel resolves that package from its own `pnpm` dependency.
  - It never downloads a binary, and it never uses a global pnpm or corepack.
  - If the platform package is missing, staging fails `EXT_SOURCE_INVALID`, naming the package.
  - pnpm's own install script is not needed: `allowBuilds.pnpm` is `false`.
- **Also added:** `es-module-lexer` as a kernel dependency and `verdaccio` as a testkit dev dependency. The plan names both.

Every version is pinned exactly: pnpm 12.6.0, es-module-lexer 3.0.2, tar 7.5.22, semver 7.8.5, @types/semver 7.8.0, verdaccio 6.10.4.

## Consequences

`06` §6.2 now says "the kernel's bundled pnpm executable".
