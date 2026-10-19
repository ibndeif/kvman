# kvman

kvman is an app that works like a small operating system. A kernel runs extensions, and a preset chooses which extensions run and how they are set up, which makes the app a person uses. Every feature is an extension, including the web UI and the AI agent. The bundled preset, `coder`, is an AI agent that works in your folders. Your own preset can be a different product built on the same pieces.

## Install and run

You need Node.js 24.

```sh
npm i -g kvman --no-fund --loglevel=error
cd ~/projects/my-app
kvman
```

kvman runs in the foreground on `127.0.0.1:3737`, opens the folder you start it from as a workspace, and opens the app in your browser. Press Ctrl+C to stop it. Then connect a model on the **Models** page and ask the agent something on the **Chat** page.

```text
kvman [--mode web] [--preset coder] [--home <dir>] [--port <n>] [--yes] [--no-open] [--log-level <level>] [--pipe]
kvman uninstall [--home <dir>] [--yes] [--keep-data | --delete-data]
```

Every flag is described in [installing](docs/user-guide/installing.md). `kvman uninstall` removes kvman, and asks before it deletes your data.

## What you get

- **An agent in your folders.** It reads the project and asks about the decisions only you can make. It plans larger work on an **execution map** that you approve, and works through connectors (shell, files, artifacts, MCP servers, your own programs). It asks before risky calls and can hand steps to specialist workers. See [the coding app](docs/user-guide/coding-app.md) and [how the agent works](docs/user-guide/the-agent.md).
- **A chat you can read and review.** The agent's calls fold into short rows between its own sentences, its answer is marked, and a **Changes** view shows each file the chat changed as a diff you can undo or ask it to commit. Approvals can be remembered per command ("Always allow"), denied with a reason, or skipped entirely with **Decide for me**; your standing **preferences** reach every chat, kvman notifies you when a chat needs you, and the agent reads web pages as Markdown, asking before each new site ([the coding app](docs/user-guide/coding-app.md)).
- **Any model.** Sign in with a Claude, ChatGPT, or GitHub Copilot plan, use an API key, or point kvman at your own server ([models and providers](docs/user-guide/models-and-providers.md)).
- **An app you can change by asking.** Type `/build-kvman` in a chat to have the agent change kvman's model, settings, and extensions, or build a new extension or a separate app for you ([building kvman](docs/user-guide/building-kvman.md)).
- **A platform for your own products.** A preset can turn kvcoder's agent into a product for people who aren't developers: its own identity, its own words, and no developer screens. It can ship as a desktop app of its own ([building a product](docs/developers/products.md)).
- **Local by design.** kvman listens only on 127.0.0.1. Your data stays in one folder (`~/.kvman`), and secrets stay in `secrets.json`. kvman has no telemetry ([privacy and security](docs/user-guide/privacy-and-security.md)).

## The desktop app

`packages/desktop` is a Tauri shell around the same kvman. It starts `kvman --pipe` and shows a home screen where you choose a workspace or open a folder, then shows kvman in its own window. It asks about new extensions in a dialog. Closing the window stops kvman. It is described in [the desktop app](docs/user-guide/desktop-app.md) and specified in [plan/14-desktop.md](plan/14-desktop.md).

```sh
pnpm build && pnpm desktop:dev                # run it from the repository
pnpm desktop:build                            # build the app, with its own Node and kvman, for this system
pnpm desktop:brand <brand.json>               # build a product's own desktop app and its installers
```

It needs Rust with `rustfmt` and `clippy`. On Linux it also needs Tauri's libraries (`libwebkit2gtk-4.1-dev` and the others in [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/)).

## Documentation

| For | Start at |
|---|---|
| People who **use** kvman: install it, connect a model, work with the agent, manage settings | [User guide](docs/user-guide/README.md) |
| People who **build** extensions, presets, products, or kvman itself: tutorial, SDK, kernel and HTTP APIs, error codes | [Developer documentation](docs/developers/README.md) |
| The specification: names, shapes, error codes, defaults, and limits | [`plan/`](plan/README.md), with every decision recorded as an ADR in [`plan/adr/`](plan/adr/) |

## Developing

You need Node 24 and pnpm (the version in `package.json`'s `packageManager`).

```sh
pnpm install
pnpm build
node packages/cli/dist/main.js        # run kvman from source
```

Before a commit, every gate must pass:

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check
```

`node release/candidate/local-candidate-main.ts` runs the same gates once, in that order, and stops at the first failure. It also checks the published packages' names and their JavaScript and declaration entries. It runs on this machine only: it doesn't cover other platforms, Rust, or the installers.

| Script | Does |
|---|---|
| `pnpm typecheck` | TypeScript strict on every package and the repository's own tooling |
| `pnpm lint` | ESLint: the import walls, 300 lines per file, no `any`, and the other rules in `CLAUDE.md` §5 |
| `pnpm test` | Vitest |
| `pnpm build` | Builds each package into its `dist/` |
| `pnpm bench:check` | Runs the benchmarks against `bench/baseline.json`; `pnpm bench:record` stores a new baseline |
| `pnpm desktop:check` | The desktop shell's Rust: `cargo fmt --check`, `cargo clippy` with warnings as errors, and `cargo test` |
| `pnpm desktop:dev`, `desktop:build`, `desktop:brand` | Run, build, or brand the desktop app |
| `pnpm changeset` | Adds a changeset, needed for every change to `@kvman/sdk`, `@kvman/testkit`, or an extension |

The rules for changing kvman are in `CLAUDE.md` and [contributing](docs/developers/contributing.md). [`milestones/`](milestones/) holds what each milestone built and the scenarios that test it.

## Releasing

Eight packages are published to npm under MIT: `kvman`, `@kvman/sdk`, `@kvman/kernel`, `@kvman/testkit`, and the four extensions `@kvman/kvai`, `@kvman/kvwebui`, `@kvman/kvcoder`, and `@kvman/kvbuilder`, which `kvman` depends on ([ADR 0026](plan/adr/0026-npm-publishing.md)).

1. `pnpm changeset version` turns the pending changesets into versions and changelogs.
2. Set the version of the root, `packages/kernel`, and `packages/cli`. Run every gate, then commit. The release workflow runs no tests, so the tests run here are the only ones that count.
3. Tag the commit `v<root version>` and push the tag.

[`.github/workflows/release.yml`](.github/workflows/release.yml) runs on the tag. It stops unless the tag is `v<root version>`. It runs `pnpm build`, `pnpm typecheck`, and `pnpm lint`, then `pnpm changeset publish`, which publishes each version that isn't on npm yet. It uses npm trusted publishing; only the first release needed a token, in the repository secret `NPM_TOKEN`.
