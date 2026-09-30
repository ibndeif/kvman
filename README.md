# kvman

An app that works like a small operating system for every kind of user: a kernel runs extensions, and a preset shapes them into the app a person uses.

The specification is `plan/` (start with `plan/README.md`). The previous implementation is on the branch `archive/v2`.

```
kvman [--mode web] [--preset coder] [--home <dir>] [--port <n>] [--yes] [--no-open] [--log-level <level>]
```

## Developing

Node 24 and pnpm (the version in `package.json` `packageManager`).

```
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check
```

| Script | Does |
|---|---|
| `pnpm typecheck` | TypeScript 6.0 strict on every package and the repository's own tooling |
| `pnpm lint` | ESLint: the import walls (`eslint/`), 300 lines per file, no `any`, and the other `CLAUDE.md` §5 rules |
| `pnpm test` | Vitest |
| `pnpm build` | Builds each package into its `dist/` |
| `pnpm bench:check` | Runs the benchmarks against their targets and `bench/baseline.json`; `pnpm bench:record` stores a new baseline |
| `pnpm changeset` | Adds a changeset (needed for every change to `@kvman/sdk`, `@kvman/testkit`, or an extension) |

## Status

| Milestone | What works |
|---|---|
| M1.1 Monorepo | The pnpm workspace with the empty packages `@kvman/sdk`, `@kvman/kernel`, `kvman` (the CLI), and `@kvman/testkit`; every gate; lint enforces the import walls and the 300-line limit. |
| M1.2 SDK | `@kvman/sdk`: the `Ctx` types (registrations, typed `exec` through the `Commands`, `Queries`, and `Settings` maps, store, files, settings, secrets, processes, `ctx.log`), `z`, and the zod schemas for manifests, presets, Problems, job and file rows, workspaces, and the HTTP envelope. |
