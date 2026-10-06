# kvman

An app that works like a small operating system for every kind of user: a kernel runs extensions, and a preset shapes them into the app a person uses. Every feature is an extension, including the web UI and the AI agent.

```
npm i -g kvman --no-fund --loglevel=error
kvman [--mode web] [--preset coder] [--home <dir>] [--port <n>] [--yes] [--no-open] [--log-level <level>]
```

kvman runs in the foreground on `127.0.0.1:3737` and opens the folder you start it from as a workspace. It needs Node.js 24.

To change kvman itself from a chat (its model, its settings, its extensions, or a new extension built for you), type `/build-kvman` in the send box, on the Chat page or in a chat, alone or followed by what you want. Until you do, the agent in that chat has no tool for changing kvman ([building kvman](docs/user-guide/building-kvman.md)).

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

## Releasing

Eight packages are published to npm under MIT: `kvman`, `@kvman/sdk`, `@kvman/kernel`, `@kvman/testkit`, and the four extensions (`@kvman/kvai`, `@kvman/kvwebui`, `@kvman/kvcoder`, `@kvman/kvbuilder`), which `kvman` depends on ([ADR 0026](plan/adr/0026-npm-publishing.md)).

1. `pnpm changeset version` turns the pending changesets into versions and changelogs.
2. Set the version of the root, `packages/kernel`, and `packages/cli`, then run every gate and commit. The release workflow runs no tests, so the tests that count are the ones run here.
3. Tag the commit `v<root version>` and push the tag.

[`.github/workflows/release.yml`](.github/workflows/release.yml) runs on the tag: it stops unless the tag is `v<root version>`, runs `pnpm build`, `pnpm typecheck`, and `pnpm lint`, then `pnpm changeset publish`, which publishes each version that isn't on npm yet. It publishes through npm trusted publishing; only the first release needs a token, in the repository secret `NPM_TOKEN`.

The rules for changing kvman are in [`docs/developers/contributing.md`](docs/developers/contributing.md) and `CLAUDE.md`. What each milestone built, and how it is tested, is in [`milestones/`](milestones/), and every decision is an ADR in [`plan/adr/`](plan/adr/).
