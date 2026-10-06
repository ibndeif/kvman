# @kvman/testkit

## 0.1.2

### Patch Changes

- d1d1fe4: kvcustomizer is renamed to kvbuilder, shown as "kvman builder" (ADR 0027, 7): the package is `@kvman/kvbuilder`, its namespace `kvbuilder`, its commands and queries `kvbuilder.*`, and its errors `kvbuilder/*`. The `coder` preset lists it. A preset of your own that names `@kvman/kvcustomizer` must name `@kvman/kvbuilder` instead. The docs of the testkit, kvwebui, and kvcoder use the new name.

## 0.1.1

### Patch Changes

- Updated dependencies
  - @kvman/kernel@0.1.1

## 0.1.0

The first published version. What it holds, in the order it was built:

- Create the empty `@kvman/sdk` and `@kvman/testkit` packages.
- Add `createTestKernel`: the real kernel in-process with a temporary home and Home folder, one worker unless set, `exec` with `as` and `workspaceId`, and `settings` and `secrets` options.
- Add `execAsync`, `waitForJob`, `cancel`, a fake `clock` whose `advance` settles the kernel's work, and `restart({ stoppedForMs })`.
- Run the test kernel in `web` mode, so it has the whole kernel of M1.6: workspaces, the `kernel.*` commands and queries, catalogs, hot reload of its `path:` extensions, and long-lived processes.
- A test kernel accepts every extension version (no trust prompt), opens its Home folder as the start folder, and logs only to `logs/kvman.log`.
- `exec` and `execAsync` take `onProgress`, which receives the progress chunks of the call's root job. A new subpath, `@kvman/testkit/fake-openai`, starts a scripted OpenAI-compatible streaming server on 127.0.0.1 for LLM tests.
- Add `kernel.watch(jobId, onProgress)`, which receives any job's progress chunks from then on, as its HTTP stream does.
- The `kvman-check` bin: run in an extension project, it loads the extension in a test kernel and reports a refused load, public input fields with no description, missing locale keys, and `setInterval` or unawaited `setTimeout` warnings, readable or with `--json`.
- The fake OpenAI server can stream a tool call's arguments in pieces (`argumentPieces`).
- The testkit gains the tools for building extensions with any harness, or none: `kvman-new` (scaffold an extension project with its platform guides, `AGENTS.md`, and a docs pair), `kvman-preset new|check`, `kvman-preview` (a preview kvman on a temporary home, until Ctrl+C), and `kvman-docs list|get` (the guides and the pages every installed extension serves). `kvman-check` also warns about a half-done or wrong `<namespace>.docs.list` and `.docs.get` pair. The package exports `./package.json`, and ships `docs/` (the guides `sdk`, `i18n`, `presets`) and `templates/`.
- The scaffold's localization guide lists `<setting>.options.<value>`, the name of a setting's choice.
- `kvman-check` also checks the translation keys of a `ui.get` `configuration`, and its messages name the extension's page, where settings now are (ADR 0014).
- `TestKernel` gains `restartRequested()`, which resolves when `kernel.restart` is called on the running kernel (ADR 0024, 2). A test kernel doesn't restart by itself.
