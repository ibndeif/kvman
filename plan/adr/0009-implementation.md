# ADR 0009 — Implementation decisions

Status: accepted, 2026-09-30. Questions that came up while building, decided with the product owner milestone by milestone.

## M1.1 Monorepo

1. **TypeScript 6.0.3.** The latest TypeScript (7.0.2, the native compiler) has no compiler API, and typescript-eslint supports only TypeScript below 6.1. The monorepo uses TypeScript 6.0.3 for typecheck, build, and lint, and the kvdev scaffold pins the same version. It moves to 7 when typescript-eslint supports it. This is an exception to "latest stable" (`CLAUDE.md` §5).
2. **Tooling.** Pinned exactly: ESLint 10.11.0 with typescript-eslint 8.71.0, Vitest 5.0.2 with its Vite 8.3.1 peer, @changesets/cli 3.0.3, and @types/node 24.19.0 (matching Node 24). The import walls are a rule of the repository's own (`eslint/`), as in archive/v2, not a plugin. There is no turbo: `pnpm -r` runs the package scripts in dependency order.
3. **The 300-line limit covers every file, tests included.** A big test suite splits into several files by topic.
