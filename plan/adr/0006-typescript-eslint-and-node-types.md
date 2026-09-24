# ADR 0006 — `typescript-eslint` and `@types/node` 24

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.1
- **Decided by**: the product owner

## Question

M0.1 needs two packages that the plan does not name (`00` D55 lists the stack):

- a parser that lets ESLint read TypeScript, without which the import walls and `max-lines` (`14` §14.1) cannot run on `.ts` files;
- type declarations for the Node APIs the kernel, CLI, testkit, and devtools use.

The latest `@types/node` is 26.x, which describes APIs that the Node 24 LTS runtime (`00` D55) does not have.

## Options

1. **`typescript-eslint` 8.70.1 and `@types/node` 24.13.6** — types match the runtime.
2. **`typescript-eslint` 8.70.1 and `@types/node` 26.6.2** — the latest, but code could type-check against APIs Node 24 lacks.
3. **Neither** — M0.1 cannot meet its *Done when*.

## Decision

Add `typescript-eslint@8.70.1` (the parser and rules for ESLint's flat config) and `@types/node@24.13.6` (the latest 24.x), pinned exactly as dev dependencies. `@types/node` follows the Node major of `00` D55, not the newest major.

## Consequences

- `00` D55 and `IMPLEMENTATION_PLAN.md` (Stack) name both packages.
- The M7.3 dependency refresh takes the latest `@types/node` of the Node major kvman runs on.
