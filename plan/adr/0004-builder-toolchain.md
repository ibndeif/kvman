# ADR 0004 — The builder toolchain and the sandboxed test process

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.5
- **Decided by**: measured by the implementer; the consequences for `11` §11.5 are reported to the product owner

## Question

`kernel.dev.build` (`11` §11.5) type-checks with the TypeScript compiler API, bundles with esbuild, and runs the project's `node:test` files in a sandboxed test process (`--permission`, read access to `dist/` and kvman's packages, no write, no child processes, no workers, no addons, `--no-experimental-sqlite`). Does that work on Node 24 as written?

## Decision

The toolchain works with three adjustments, which `11` §11.5 now states:

1. The test process runs `node --test --test-isolation=none`. The default isolation starts one child process per test file, which the sandbox denies (`ERR_ACCESS_DENIED`).
2. The test process starts in the project's `dist/` folder and names its test files by relative paths. Under `--permission`, the runner reports "Could not find" for an absolute path given from another working directory.
3. Type-checking the tests needs the Node type declarations (`node:test`, `node:assert/strict`), so `@kvman/devtools` ships `@types/node` (the 24.x line, ADR 0006) with the fixed compiler options.

## Consequences

M6.1 builds the three stages with these settings. The compile stage (TypeScript 6.0.3 compiler API, esbuild 0.28.2) runs unsandboxed, because it runs no project code and esbuild starts its own native binary.

## Measurements

Node v24.21.0, Linux, a one-file project with three test files, run outside the repository with exactly pinned `typescript@6.0.3` and `esbuild@0.28.2`.

| Step | Result |
|---|---|
| type-check with `ts.createProgram` (strict, NodeNext, the flags of `14` §14.1) | 360 ms; without `@types/node`: "Cannot find name 'node:test'" |
| bundle `src/extension.ts` and three tests with esbuild (`@kvman/sdk`, `@kvman/testkit`, `node:*` external) | 13 ms |
| sandboxed `node --test` (default isolation) | fails: `ERR_ACCESS_DENIED` |
| sandboxed `node --test --test-isolation=none`, in `dist/` | the test passes |
| a test that writes a file | fails: `ERR_ACCESS_DENIED` |
| a test that imports `node:sqlite` | fails: `ERR_UNKNOWN_BUILTIN_MODULE`; without `--no-experimental-sqlite` it loads |
