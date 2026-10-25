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

- **An agent in your folders.** It reads the project and asks about the decisions only you can make. It plans larger work on an **execution map** that you approve, and works through connectors (shell, files, artifacts, MCP servers, your own programs). It asks before risky calls, can hand steps to specialist workers (which think at medium unless you say otherwise), puts a complex request whose approach is open to the **council** worker first (a debate between an engineer, a devil's advocate, a dumb customer, and the field's top expert, ending in one final plan), and works in few steps, reading several files at once. It asks you once per project how you want work tested (the existing tests, unit tests, end-to-end tests, or you test it yourself) and records your answer in `AGENTS.md`; it runs the tests that cover each change and the whole suite once at the end. A chat's old tool results are cleared in large batches so the model's cache keeps answering quickly, and the **Running** popover can restart a dev server or run an ended one again without asking the agent. See [the coding app](docs/user-guide/coding-app.md) and [how the agent works](docs/user-guide/the-agent.md).
- **A chat you can read and review.** Each step's headline, in the agent's own words ("Checking why the import fails"), is a line you can open to read its thinking, and the calls under it fold into short rows that say what they did ("Read 3 files, changed 1 file, ran 1 command"); the running line shows the latest headline, the turn's time, and the map's step in progress, and a test that fails while the agent fixes it reads calmly (`exit 1`), not as an alarm, counts read right in English and Arabic, its answer is marked, and a **Changes** view shows each file the chat changed as a diff you can undo or ask it to commit. Approvals can be remembered per command ("Always allow"), denied with a reason, or skipped entirely with **Decide for me**; your standing **preferences** reach every chat, kvman notifies you when a chat needs you, and the agent reads web pages as Markdown, asking before each new site ([the coding app](docs/user-guide/coding-app.md)).
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

## The VS Code extension

`packages/vscode` shows kvman in VS Code's side bar, under its own activity bar icon, like a native chat extension. It runs the `kvman` on the PATH with `--pipe` in the window's first folder (or offers to install it), and frames the web app embedded (`?embed=parent`): no frame of its own, VS Code's colors and fonts, Pages, Settings, and Open in browser in the view's title bar, "Open diff" and file paths that open in VS Code's editor, "Add to kvman chat" from the editor and the explorer, and sign-ins in the system's browser. A page can offer the title bar's **New** button (kvcoder's chat does); the Pages menu also lists panels and has a **Language** row; a slim status line shows the status items; and **Ctrl+Alt+K** adds the selection or the open file to the chat. The window that started kvman stops it when it closes, and another window notices at once (the frame posts `kvman.lost`), starts kvman again, and reloads its view. Remote windows aren't supported yet. It is described in [the VS Code extension](docs/user-guide/vscode-extension.md) and specified in [plan/15-vscode.md](plan/15-vscode.md) (ADR 0099, ADR 0100, and ADR 0101).

```sh
pnpm vscode:package                           # build packages/vscode/dist/kvman.vsix
code --extensionDevelopmentPath=$PWD/packages/vscode/dist/extension   # try it after pnpm build
```

The setting `kvman.path` names the `kvman` to run, such as a script that runs `node packages/cli/dist/main.js`.

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
| `pnpm vscode:package` | Builds the VS Code extension and packs it into `packages/vscode/dist/kvman.vsix` |
| `pnpm changeset` | Adds a changeset, needed for every change to `@kvman/sdk`, `@kvman/testkit`, or an extension |

The rules for changing kvman are in `CLAUDE.md` and [contributing](docs/developers/contributing.md). [`milestones/`](milestones/) holds what each milestone built and the scenarios that test it.

## Releasing

Eight packages are published to npm under MIT: `kvman`, `@kvman/sdk`, `@kvman/kernel`, `@kvman/testkit`, and the four extensions `@kvman/kvai`, `@kvman/kvwebui`, `@kvman/kvcoder`, and `@kvman/kvbuilder`, which `kvman` depends on ([ADR 0026](plan/adr/0026-npm-publishing.md)).

1. `pnpm changeset version` turns the pending changesets into versions and changelogs.
2. Set the version of the root, `packages/kernel`, `packages/cli`, and `packages/vscode`. Run every gate, then commit. The release workflow runs no tests, so the tests run here are the only ones that count.
3. Tag the commit `v<root version>` and push the tag.

[`.github/workflows/release.yml`](.github/workflows/release.yml) runs on the tag. It stops unless the tag is `v<root version>`. It runs `pnpm build`, `pnpm typecheck`, and `pnpm lint`, then `pnpm changeset publish`, which publishes each version that isn't on npm yet. It uses npm trusted publishing; only the first release needed a token, in the repository secret `NPM_TOKEN`.

Its `vscode` job packs the VS Code extension, attaches `kvman.vsix` to the tag's draft GitHub Release (creating the draft when there is none), and publishes it to the Visual Studio Marketplace and Open VSX under the publisher `ibndeif`, with the repository secrets `VSCE_PAT` and `OVSX_PAT` ([ADR 0099](plan/adr/0099-vscode-extension.md)). The publisher and both tokens must exist before the first tag that carries the extension.
