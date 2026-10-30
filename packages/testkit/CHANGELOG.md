# @kvman/testkit

## 0.1.10

### Patch Changes

- 5b1d815: testkit counts kvvideo among the extensions that ship with kvman, as the `kvman` package now depends on it (ADR 0107).

## 0.1.9

### Patch Changes

- Updated dependencies [486d037]
- Updated dependencies [cc5845f]
  - @kvman/sdk@0.1.5
  - @kvman/kernel@0.4.7

## 0.1.8

### Patch Changes

- 1942677: Counts that read as words (ADR 0098). A catalog text may hold plural forms separated by `|`, one per plural category of its language (English two, Arabic six), and kvwebui chooses one by a numeric `count` param, in `kvman.t`, toasts, and contributed views and status items. kvman's own count texts use them: `1 file`, `Show 1 earlier message`, `1 provider`, `Allow this command?`, `1 turn`. A fold of calls reads as a sentence, `Read 3 files, changed 1 file, ran 1 command · 1 failed`, with each file counted once, `fs read-files` counted as a read, the failures in the danger color, and the words at the row's start. The testkit's i18n guide explains plural forms.
- Updated dependencies [1942677]
  - @kvman/sdk@0.1.4
  - @kvman/kernel@0.4.6

## 0.1.7

### Patch Changes

- Updated dependencies [d541dbc]
  - @kvman/sdk@0.1.3
  - @kvman/kernel@0.4.4

## 0.1.6

### Patch Changes

- 9e2439b: Products on kvcoder, and the fixes from the research build review (ADR 0082): `kvwebui.home` defaults to the Extensions page, so an extension that depends on kvcoder passes its checks; a preset hides developer screens (`kvwebui.nav.hidden` with the built-in pages, `kvwebui.status.hidden`, `kvwebui.workspacePicker`); `kvcoder.profile` gives the agent a product's identity, a short general method, and the Chat page's words; a connector command may show its own `card`; `kvcoder.artifact.write` and `.edit` are public; read-only helpers run other extensions' queries; a chat link from another workspace shows one notice; the new chat's approval note is one plain line and Home is called Home; the scaffold type-checks and starts a Git repository (`GIT_FAILED`); the preview's wrong-kind calls say which call to use; and the builder's guide teaches products for people who aren't developers.

## 0.1.5

### Patch Changes

- eb3ee85: The `/build-kvman` guide never lets the agent edit kvman itself, keeps extensions to the public APIs, designs from a map of which extension serves which need, and uses a developer's own words. `kvman extensions-get` gives one extension's public commands, queries, and settings with their JSON Schemas. `createTestKernel` and `kvman-check` load a project's declared dependencies from its `node_modules`, `kvman-check` names the npm line for one that isn't installed, and the preview adds the bundled extensions a project depends on. The `sdk` and `conventions` guides are the complete reference (ADR 0080).

## 0.1.4

### Patch Changes

- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
  - @kvman/sdk@0.1.2
  - @kvman/kernel@0.3.4

## 0.1.3

### Patch Changes

- b2dc3f9: A fourth built-in guide, `conventions`, states kvman's rules for an extension in one place: names, public and private, errors, jobs and what ends with them, handler points in place of events, storage, settings and their scopes, secrets, validation, text for people, who owns UI, the docs pair, dependencies, and checks. `kvman-docs`, `docs list` and `docs get`, and the scaffold's copy into a project's `docs/` now have four guides, and kvbuilder's `building` page names it (ADR 0030).
- Updated dependencies [85e9ff8]
  - @kvman/sdk@0.1.1
  - @kvman/kernel@0.2.1

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
