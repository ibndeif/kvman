# ADR 0005 — Hold TypeScript at 6.x

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.1
- **Decided by**: the product owner

## Question

`00` D55 and `14` §14.7 ask for the latest stable version of every dependency at M0.1. The latest stable TypeScript is 7.0.2 (the native compiler). But:

- the latest `typescript-eslint` (8.70.1, needed to lint TypeScript, ADR 0006) supports only `typescript >=4.8.4 <6.1.0`;
- TypeScript 7 publishes its JavaScript API only under `typescript/unstable/*`, while the builder toolchain (M0.5 spike, M6.1 `kernel.dev.build`, `11` §11.5) type-checks projects with "the TypeScript compiler API".

`14` §14.7 says that holding an older major requires an ADR.

## Options

1. **TypeScript 6.0.3 everywhere** — one compiler for `tsc`, ESLint, and `@kvman/devtools`; stable compiler API.
2. **TypeScript 7.0.2 for type-checking and builds, 6.0.3 only as the ESLint parser** — two compilers in one repository.
3. **TypeScript 7.0.2 without a TypeScript-aware linter** — ESLint could not parse `.ts` files, so the import walls and `max-lines` could not run.

## Decision

Pin `typescript@6.0.3` (the latest 6.x) exactly, for every package, the lint parser, and the builder toolchain. Move to TypeScript 7 when `typescript-eslint` supports it and TypeScript 7 has a stable compiler API; that move is a new ADR.

## Consequences

- The root `package.json` pins `typescript` at `6.0.3`.
- `00` D55 and `IMPLEMENTATION_PLAN.md` (Stack) name TypeScript 6 and this ADR.
- The M7.3 dependency refresh re-checks this hold.
