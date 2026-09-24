# ADR 0049 — Tests may import other packages' JSON fixtures

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.3
- **Decided by**: the product owner

## Question

M1.3-H1 compares the manifest the kernel records for the pdf example with the M0.3 fixture in `packages/protocol/test/fixtures/`. The test lives in `packages/testkit/test/` (ADR 0041), and the import walls forbid a relative import that leaves a package.

## Options

1. **Test files may import JSON from another package's `test/fixtures/`** (data, never code).
2. Put the test in the repository's root `test/` folder.
3. Copy the fixture and add a test that keeps the copies equal.

## Decision

Option 1: the `kvman/import-walls` rule lets a test file import a `.json` file inside another package's `test/fixtures/` folder. Every other relative import that leaves a package, and every such import from production code, stays an error.

## Consequences

`01` §1.5 states the exception.
