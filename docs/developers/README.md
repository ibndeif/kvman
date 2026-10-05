# kvman developer documentation

This documentation is for people who build on kvman: extensions, presets, and kvman itself. When you have read the first two pages you can scaffold an extension, run it, test it, and preview it, with kvman's own agent, with another assistant such as Claude Code or pi, or by hand.

If you only use kvman, read the [user guide](../user-guide/README.md) instead.

## Three ways to work, one set of first steps

| You work with | You use |
|---|---|
| kvman's own agent | the `ext`, `preset`, `preview`, `docs`, and `kvman` connectors of the `coder` preset |
| another assistant (Claude Code, pi, …) or your editor | the command-line tools of `@kvman/testkit`, and the files the scaffold writes (`AGENTS.md`, `docs/`) |
| nothing but a terminal | the same command-line tools |

The agent's connectors run the same tools underneath, so all three ways give the same result:

| Tool | Does |
|---|---|
| `kvman-new <folder> --name <name> --namespace <namespace> [--web]` | scaffolds an extension project and runs `npm install` |
| `kvman-check` | loads the project in a test kernel and reports what kvman would refuse or show untranslated |
| `kvman-preset new\|check` | writes and checks a preset |
| `kvman-preview <folder>…` | runs the projects in a separate kvman on a temporary home |
| `kvman-docs list\|get` | reads the guides and the pages every installed extension serves about itself |

## How the pieces fit

- The **kernel** runs **extensions**: it keeps jobs, workers, storage, workspaces, settings, and secrets, and serves an HTTP API. It knows no product concept.
- An **extension** registers commands, queries, settings, and handlers. The chat app (kvcoder), the web app (kvwebui), model access (kvai), and the customizing tools (kvcustomizer) are all extensions, and any of them can be removed.
- A **preset** chooses which extensions run and their starting settings.
- `@kvman/sdk` is the whole API an extension sees; `@kvman/testkit` runs a real kernel for tests and holds the tools above.

## The pages

**Start here**

- [getting-started.md](getting-started.md): a 15-minute tutorial
- [anatomy.md](anatomy.md): what an extension is made of
- [sdk.md](sdk.md): every `ctx` call

**Building blocks**

- [jobs.md](jobs.md): commands, queries, retries, schedules
- [storage.md](storage.md): the store, files, settings, secrets
- [views.md](views.md): pages, navigation, and view trees in kvwebui
- [components.md](components.md): custom Vue components
- [localization.md](localization.md): texts, languages, right to left
- [connectors.md](connectors.md): extending kvcoder, and the pull convention
- [agents-and-tools.md](agents-and-tools.md): an agent of your own, with tools that are plain functions
- [documenting-your-extension.md](documenting-your-extension.md): telling others how to use yours
- [presets.md](presets.md): which extensions run

**Working**

- [testing.md](testing.md): the testkit
- [preview-and-hot-reload.md](preview-and-hot-reload.md): seeing your extension run

**Reference**

- [kernel-api.md](kernel-api.md): every kernel command and query
- [http-api.md](http-api.md): routes, the envelope, security
- [errors.md](errors.md): every error code

**Beyond your own extension**

- [publishing.md](publishing.md): sharing an extension
- [architecture.md](architecture.md): how kvman is built
- [contributing.md](contributing.md): the rules for changing kvman itself

## Reading the docs from a running kvman

An installed extension can document itself, and `kvman-docs list` shows every page. `kvman-docs get @kvman/kvwebui views` prints one. See [documenting-your-extension.md](documenting-your-extension.md).

## Next

- [getting-started.md](getting-started.md)
