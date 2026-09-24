# ADR 0020 — Package tests may import the test tools

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.2
- **Decided by**: the product owner

## Question

The import walls (`01` §1.5) allow `@kvman/protocol` to import only `zod`, and the lint rule applies to its test files too, which need Vitest. The plan does not say whether the walls cover tests.

## Options

1. **Test files may also import the test tools of `00` D55** (`vitest`, `fast-check`, `@playwright/test`); every other wall still applies.
2. Test files are exempt from the walls.

## Decision

Option 1.

## Consequences

`eslint/walls.ts` allows the three test tools in test files (a `test/` folder or a `*.test.ts` file); scenario M0.2-E40 covers it.
