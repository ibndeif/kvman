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

In a chat, the running line shows the turn's steps and estimated cost so far. When a program worker's run changes what is staged in Git, the chat says so and offers "Restore staging". An approval's Deny and Allow sit in a row under its call, and a card that read a background run shows that run's description, status, time, and output (ADR 0062). A helper answers the chat's agent only: it asks you nothing and writes no artifact (ADR 0063). The agent plans a larger task on the **execution map**, a diagram in the panel beside the chat: steps that wait on each other, parallel ones side by side, each marked as it starts and done only with evidence, with a "Noted for later" list for what the task didn't need (ADRs 0064 and 0065). When a long chat is summarized, at 60% of the model's window by default, kvman itself adds your own messages, the map, the changed files, the running background work, and the artifacts to the summary, so the agent goes on without reading everything again (ADR 0066). The agent waits for a background run with one call in place of asking for its output again and again, and is told what is still running when you write to it (ADR 0068). **Model for workers** on Coder's page sets a cheaper model for helpers whose worker names none, and a connection the provider drops mid-answer is retried without you (ADR 0069). A fenced `mermaid` block in an artifact or an answer is drawn as a diagram (ADR 0067). With a browser MCP server such as Playwright, the agent tries the page it built with `mcp run`, which keeps one browser for a whole sequence of tools (ADR 0070).

The panel beside a chat shows one title; with a map or several artifacts, pressing it opens the list of them, and nothing in the header scrolls sideways. An artifact or an execution map that is updated opens the panel on itself, also after you closed it. Drag the panel's edge beside the conversation (or focus it and press Left or Right) to set its width, from 20 rem to 70% of the chat area; a double-click returns to the starting width, and the browser keeps the width for every chat. The thinking level of the send box opens as a list above the box, so every level is in the window (ADR 0071).

The agent chooses how to work on each task: it sizes the task up, answers a question directly, does and checks a small change, asks when the request is unclear, and plans larger work on the execution map. The map is its detailed implementation plan: press a step to read what it changes and how. Before it starts, the agent asks you to agree to the plan, and you can write what to change. An edit to one of the project's files that the task needs no longer asks for approval; a call that is hard to take back, or that reaches outside the workspace folder, still does, and `kvcoder.approval: ask` asks for every call (ADR 0072).

An image you attach is named to the agent as shown in the message, so it no longer looks for it among the project's files. In the desktop app on Linux, pasting a copied image (a screenshot, say) with Ctrl+V attaches it; if the clipboard can't be read, a message says to use the attach button (ADR 0073).

The execution map is the agent's execution path: the steps it found, after looking at the project, to be the best and fastest way to do what you asked, each naming who does it (the agent itself with a connector, or a specialist such as the designer, the architect, the tester, or the reviewer when the step needs that skill). Press a step to open its details in a dialog: what it changes, what it comes after and uses, how it is checked, its evidence, and its note; the dialog follows the step while the agent works. A branch means delegation: steps side by side are done at the same time, each by a worker, and the agent's own steps are one line; the agent marks a step in progress when it starts it and done as soon as its check passed. If it changes files or runs a shell line while steps are left and none is marked in progress, kvman reminds it to mark the step or to update the map; nothing is blocked (ADRs 0074 and 0075).

The open chat stands out in the chat list: its row is tinted and its title is heavier. The four specialist workers have fuller instructions and descriptions the agent chooses by: `ui-ux` designs the experience and the visuals to usability and accessibility standards (WCAG 2.2 AA), `architect` designs the structure inside the project's own patterns and conventions, `tester` is a QA engineer that tests the critical flows, security, and performance, automated and by hand, and reports the issues, and `reviewer` reports wrong style, needless complexity, and unclean or unclear code. A workers list you saved keeps its own words; Reset on the list brings the new ones (ADR 0076).

Approval has a third mode, **Never ask**: nothing asks you before a call, including commands an extension marked as needing approval and worker programs set to ask, while the agent's own questions still wait. Choosing it shows a confirmation first, and the chat's approval note says that nothing asks. The setting moved from the `shell` connector's dialog to the Agent card of Coder's page (**Extensions → Coder**) and its key is now `kvcoder.approval`; a value saved under `kvcoder.shell.approval` is not carried over, and a preset naming the old key must be edited (ADR 0077).

Extensions can continue collection `find` with an exclusive `after` ID in ascending or descending order, without raising the 1000-document page limit. Pages do not share a cross-call snapshot; updated SDK types alone do not add this support to an older kernel ([storage guide](docs/developers/storage.md)).

With `/build-kvman`, the agent builds on kvman and never edits it: not kvman's packages wherever they are, not its home folder, and not a project's `dist/` or `node_modules/`; an extension it writes uses only the SDK and the public names of the kernel and the installed extensions, and what they don't offer it says plainly. It designs first, from a map of which extension serves which need (a page from kvwebui, a model call from kvai, an agent tool from kvcoder), and with your own words when you use kvman's. `kvman extensions-get { name }` gives one extension's public commands, queries, and settings with their JSON Schemas. A project that depends on another extension installs it as an exact devDependency (`npm install --save-dev --save-exact <name>@<version>`); then `npm run check`, its tests, and `createTestKernel` load it from `node_modules`, `kvman-check` names that line when it is missing, and the preview adds the bundled extensions a project depends on. The `sdk` guide is the complete API reference (ADR 0080).

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
