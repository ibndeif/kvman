# kvman

An app that works like a small operating system for every kind of user: a kernel runs extensions, and a preset shapes them into the app a person uses. Every feature is an extension, including the web UI and the AI agent.

```
npm i -g kvman --no-fund --loglevel=error
kvman [--mode web] [--preset coder] [--home <dir>] [--port <n>] [--yes] [--no-open] [--log-level <level>] [--pipe]
kvman uninstall [--home <dir>] [--yes] [--keep-data | --delete-data]
```

kvman runs in the foreground on `127.0.0.1:3737` and opens the folder you start it from as a workspace. It needs Node.js 24. `kvman uninstall` removes it again, and asks before it deletes your data ([installing](docs/user-guide/installing.md#removing-kvman)).

A program can run kvman too: with `--pipe`, kvman writes one JSON object per line instead of its terminal text (`running` with the URL, `trust` when it needs an answer about new extensions, `restarting`, `joined`, `failed`), takes the trust answer as a line on its input, and stops cleanly when its input closes ([the plan](plan/14-desktop.md), §14.2). The desktop app runs kvman this way.

**The desktop app** (`packages/desktop`, [the plan](plan/14-desktop.md)) is a Tauri shell around the same kvman: it starts kvman, shows a home screen where you choose a workspace or open a folder, and then shows kvman in its own window. Closing the window stops kvman. It asks about new extensions in a dialog instead of the terminal, and it joins a kvman that already runs on the home. For now it runs from the repository, against the built `packages/cli` and the Node on your `PATH`; the installers come next.

```
pnpm build && pnpm desktop:dev
```

It needs Rust with `rustfmt` and `clippy`, and on Linux Tauri's libraries (`libwebkit2gtk-4.1-dev` and the others in [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/)).

To change kvman itself from a chat (its model, its settings, its extensions, or a new extension built for you), type `/build-kvman` in the send box, on the Chat page or in a chat, alone or followed by what you want. The agent can also change the app's name and home page, and build a separate app you start with `kvman --preset <name>`. Until you do, the agent in that chat has no tool for changing kvman ([building kvman](docs/user-guide/building-kvman.md)).

The agent in a chat knows the date and time of each message you send, and a long chat's summary reuses what the model's provider has already cached, so it costs far less ([the coding app](docs/user-guide/coding-app.md)).

Short-lived shell commands and program workers check cancellation before creating a process. If a process was already created, its runner requests its shutdown and waits for it to close before reporting cancellation; it does not report that as an ordinary command failure or timeout. Intentionally backgrounded shell processes keep their existing lifecycle ([ADR 0039](plan/adr/0039-kvcoder-process-cancellation.md)).

A workspace whose folder is gone is closed when kvman starts, and its data is kept. The workspace picker lists the closed workspaces, where one can be reopened or deleted for good (`kernel.workspace.delete`); deleting stops the workspace's running work first and never touches its folder ([kernel API](docs/developers/kernel-api.md)).

In a chat, the running line shows the turn's steps and estimated cost so far. When a program worker's run changes what is staged in Git, the chat says so and offers "Restore staging". An approval's Deny and Allow sit in a row under its call, and a card that read a background run shows that run's description, status, time, and output (ADR 0062).

Extensions can continue collection `find` with an exclusive `after` ID in ascending or descending order, without raising the 1000-document page limit. Pages do not share a cross-call snapshot; updated SDK types alone do not add this support to an older kernel ([storage guide](docs/developers/storage.md)).

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
node release/candidate/local-candidate-main.ts
```

The explicit local candidate runs `typecheck`, `lint`, `test`, and `build` once in that order, verifies the original SDK, kernel, CLI, and testkit package names and JavaScript/declaration entries, then runs `bench:check` once. It stops at the first failure and identifies the host OS/architecture. Vitest does not nest repository-wide gates. Individual scripts remain available below; this local check is not a CI or publish blocker and does not certify other platforms, Rust, or installers.

| Script | Does |
|---|---|
| `pnpm typecheck` | TypeScript strict on every package and the repository's own tooling |
| `pnpm lint` | ESLint: the import walls, 300 lines per file, no `any`, and the other rules in `CLAUDE.md` §5 |
| `pnpm test` | Vitest |
| `pnpm build` | Builds each package into its `dist/` |
| `pnpm bench:check` | Runs the benchmarks against `bench/baseline.json`; `pnpm bench:record` stores a new baseline |
| `pnpm desktop:check` | The desktop shell's Rust: `cargo fmt --check`, `cargo clippy` with warnings as errors, and `cargo test` |
| `pnpm desktop:dev` | Runs the desktop app from the repository |
| `pnpm changeset` | Adds a changeset (needed for every change to `@kvman/sdk`, `@kvman/testkit`, or an extension) |

To run from source after `pnpm build`: `node packages/cli/dist/main.js`.

## Releasing

Eight packages are published to npm under MIT: `kvman`, `@kvman/sdk`, `@kvman/kernel`, `@kvman/testkit`, and the four extensions (`@kvman/kvai`, `@kvman/kvwebui`, `@kvman/kvcoder`, `@kvman/kvbuilder`), which `kvman` depends on ([ADR 0026](plan/adr/0026-npm-publishing.md)).

1. `pnpm changeset version` turns the pending changesets into versions and changelogs.
2. Set the version of the root, `packages/kernel`, and `packages/cli`, then run every gate and commit. The release workflow runs no tests, so the tests that count are the ones run here.
3. Tag the commit `v<root version>` and push the tag.

[`.github/workflows/release.yml`](.github/workflows/release.yml) runs on the tag: it stops unless the tag is `v<root version>`, runs `pnpm build`, `pnpm typecheck`, and `pnpm lint`, then `pnpm changeset publish`, which publishes each version that isn't on npm yet. It publishes through npm trusted publishing; only the first release needs a token, in the repository secret `NPM_TOKEN`.

The rules for changing kvman are in [`docs/developers/contributing.md`](docs/developers/contributing.md) and `CLAUDE.md`. What each milestone built, and how it is tested, is in [`milestones/`](milestones/), and every decision is an ADR in [`plan/adr/`](plan/adr/).
