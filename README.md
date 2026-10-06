# kvman

An app that works like a small operating system for every kind of user: a kernel runs extensions, and a preset shapes them into the app a person uses. Every feature is an extension, including the web UI and the AI agent.

```
npm i -g kvman
kvman [--mode web] [--preset coder] [--home <dir>] [--port <n>] [--yes] [--no-open] [--log-level <level>]
```

kvman runs in the foreground on `127.0.0.1:3737` and opens the folder you start it from as a workspace. It needs Node.js 24.

## Documentation

| For | Start at |
|---|---|
| People who **use** kvman: install, connect a model, chat with the agent, manage settings | [User guide](docs/user-guide/README.md) |
| People who **build** extensions, presets, or kvman itself: tutorial, SDK, kernel and HTTP APIs, error codes | [Developer documentation](docs/developers/README.md) |
| The specification: names, shapes, error codes, defaults, and limits | [`plan/`](plan/README.md) |

## Developing

Node 24 and pnpm (the version in `package.json` `packageManager`).

```
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check
```

| Script | Does |
|---|---|
| `pnpm typecheck` | TypeScript strict on every package and the repository's own tooling |
| `pnpm lint` | ESLint: the import walls, 300 lines per file, no `any`, and the other rules in `CLAUDE.md` §5 |
| `pnpm test` | Vitest |
| `pnpm build` | Builds each package into its `dist/` |
| `pnpm bench:check` | Runs the benchmarks against `bench/baseline.json`; `pnpm bench:record` stores a new baseline |
| `pnpm changeset` | Adds a changeset (needed for every change to `@kvman/sdk`, `@kvman/testkit`, or an extension) |

To run from source after `pnpm build`: `node packages/cli/dist/main.js`.

The rules for changing kvman are in [`docs/developers/contributing.md`](docs/developers/contributing.md) and `CLAUDE.md`. What each milestone built, and how it is tested, is in [`milestones/`](milestones/), and every decision is an ADR in [`plan/adr/`](plan/adr/).
