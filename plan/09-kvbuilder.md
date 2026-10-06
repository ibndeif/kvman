# 09 — kvbuilder (namespace `kvbuilder`)

kvbuilder ("kvman builder") is the kvcoder extension for building kvman: developing extensions and presets (this file), and managing the running app (ADR 0010; ADR 0027, 7). It has no loop of its own: it extends kvcoder (§8.4), registering its connectors, each with `optIn: true`, and its slash command `/build-kvman` from its `kernel.started` handler (ADR 0027, 14). Until the person runs `/build-kvman` in a chat, nothing of kvbuilder is in that chat's prompt, its connectors included (§9.4, ADR 0027). The `coder` preset runs it. Projects live in the workspace folder, and the agent edits their files with `fs`.

**Any harness, or none.** Developing an extension never needs kvbuilder. The scaffold, the guides, the checks, and the preview are `@kvman/testkit` bins (§10), so Claude Code, pi, another harness, or a person typing by hand uses them directly. kvbuilder's connectors run those bins, and the guide that `/build-kvman` loads steers the agent to them (ADR 0010, 1–3; ADR 0027).

## 9.1 Connectors

The five connectors are registered with `optIn: true` (plan 08 §8.4), so a chat has them only after `/build-kvman` ran in it (§9.4; ADR 0027, 4 and 6). The agent makes each call with kvcoder's `run` tool (plan 08 §8.2, ADR 0011); the table writes `run { connector: 'ext', command: 'new', payload: { … } }` as `ext new { … }`. Every connector also has kvcoder's `help`.

| Call | Kernel command | Does |
|---|---|---|
| `ext new { "name", "namespace", "folder", "web"? }` | `kvbuilder.ext.new` | runs `kvman-new` (§9.2, §10) → `{ folder, name, namespace, web }` |
| `ext list` | `kvbuilder.ext.list` | the projects in the workspace folder (folders whose package.json has a `kvman` field) → `[{ folder, name, namespace, version }]`, sorted by folder |
| `ext check { "folder" }` | `kvbuilder.ext.check` | runs `npx tsc --noEmit --pretty false`, then `npm run check -- --json` → `[{ file?, message, hint }]`, TypeScript's findings first |
| `ext test { "folder" }` | `kvbuilder.ext.test` | runs `npm test` → `{ passed, exitCode, output }` (the last 30 KB of the output) |
| `preset new { "name", "file" }` | `kvbuilder.preset.new` | runs `kvman-preset new` → `{ file }` |
| `preset check { "file" }` | `kvbuilder.preset.check` | runs `kvman-preset check`, which validates the preset's schema and its references (extensions, settings, pages) → `[{ file, message, hint }]` |
| `preview start { "extensions": [folders], "preset"?: file }` | `kvbuilder.preview.start` | starts `kvman-preview` (§9.3) through the process service → `{ url }` |
| `preview stop` / `preview status` | `kvbuilder.preview.stop` / `.status` | `{}` / `{ running: false }` or `{ running: true, url, extensions, startedAt }` |
| `preview query-get { "name", "input"? }` / `preview command-run { "name", "input"? }` | `kvbuilder.preview.query.get` / `kvbuilder.preview.command.run` | runs a public query, or a public command, of the preview kvman over its HTTP API (§9.3) → `{ ok: true, output }` or `{ ok: false, problem: { code, message, params? } }` |
| `kvman model-list` / `kvman model-set { "model" }` | `kvbuilder.app.model.list` / `.set` | the models that can be called now (kvai's `kvai.model.list`, for each connected provider) / sets `kvai.defaultModel` (global) |
| `kvman settings-list` / `settings-set { "key", "value", "scope" }` / `settings-reset { "key", "scope" }` | `kvbuilder.app.settings.list` / `.set` / `.reset` | `kernel.settings.list`, `.set`, `.reset` |
| `kvman extensions-list` / `extensions-install { "source" }` / `extensions-uninstall { "name" }` | `kvbuilder.app.extensions.list` / `.install` / `.uninstall` | `kernel.extensions.list` / `kernel.extensions.install`, with a `path:` source resolved from the workspace (below) / `.uninstall` (§2.12) |
| `kvman restart` | `kvbuilder.app.restart` | `{}` → `{ restarting: true }`: runs `kernel.restart` (§2.14, ADR 0024, 7); the person is asked first |
| `kvman preset-get` | `kvbuilder.app.preset.get` | `kernel.preset.get` (§2.12) |
| `kvman workspaces-list` / `jobs-list { "status"?, "limit" }` / `jobs-get { "id" }` / `processes-list` / `health-get` | `kvbuilder.app.workspaces.list` / `.app.jobs.list` / `.app.jobs.get` / `.app.processes.list` / `.app.health.get` | `kernel.workspace.list` / `kernel.jobs.list` / `kernel.jobs.get` / `kernel.processes.list` / `kernel.health.get` (§2.12), each with the kernel query's input and output |
| `kvman query-get { "name", "input"? }` | `kvbuilder.app.query.get` | runs the public query `name` of the running app with `input` (`{}` when left out) → its output |
| `docs list` | `kvbuilder.guides.list` | `{ pages: [{ extension, topic, title }], problems: [{ extension, problem }] }`: the three built-in guides (`extension: "kvman"`), then the pages of every loaded extension that serves docs (§9.5); `problems` has one entry for each extension whose docs failed (ADR 0010, 15) |
| `docs get { "extension"?, "topic" }` | `kvbuilder.guides.get` | `{ extension, topic, title, markdown }`; with no `extension` the topic is a built-in guide (`sdk`, `i18n`, `presets`), read from the testkit's `docs/`; `NOT_FOUND` for an unknown extension or topic |

- **The `kvman` connector** shows and changes the app the agent runs in, and `ext` builds a project in the workspace (ADR 0010, 8). Its commands are public and each wraps the kernel command or query named in the table; none reads or writes a secret, and a change to the preset applies at the next start, which the answer says (`restartRequired`). `restart` restarts kvman (§2.14, ADR 0024). There is no command that opens or closes a workspace (ADR 0022, 15).
- **Changes ask the person** (ADR 0022, 5). `model-set`, `settings-set`, `settings-reset`, `extensions-install`, and `extensions-uninstall` are registered with `asks: true` (plan 08 §8.4), so the person approves each call first. The reads never ask.
- **Installing a project** (ADR 0022, 6; ADR 0025). `extensions-install { source }` with a `path:` source checks the folder before the kernel's command runs. The folder resolves against the workspace folder and must stay inside it, as every folder does (`VALIDATION_FAILED`). It must hold a package.json with a `kvman` field (`kvbuilder/NOT_A_PROJECT`); the kernel reads its name (§2.12). The source is sent as `path:<absolute folder>`, since the kernel resolves a relative one against the preset file (§2.9). `bundled:<name>` and `npm:<name>@<version>` sources go to the kernel unchanged.
- **`query-get`** (ADR 0022, 8 and 13). `name` must be a public query of the running app, checked through `kernel.registrations.list`: a command's name fails `VALIDATION_FAILED`, and a name no public query has fails `NOT_FOUND`. A name under `kernel.secrets.` fails `VALIDATION_FAILED`: the connector never lists a secret's name either (ADR 0010, 6). The query runs in the chat's workspace and its own Problem passes through. There is no such command for commands: a command of the app is reached only through a connector that names it, so no payload with a secret reaches the chat.
- **Descriptions.** Each connector's `description` says what it is for and when to use it (ADR 0009, 170): `kvman` to see and change the app itself; `ext` for any work on an extension, running `check`, then `test`, after changing one; `preset` to create a preset file and check it before running it; `preview` to show the person a project working and to check it by calling its commands and queries, stopping it when done; `docs` before writing an extension, preset, view, or component.
- **Folders.** Every `folder` and `file` resolves against the workspace folder and must stay inside it (`VALIDATION_FAILED`). `ext check` and `ext test` of a folder whose package.json has no `kvman` field fail `kvbuilder/NOT_A_PROJECT` (ADR 0009, 121, 126).
- **`ext new`.** `name` is an npm package name (lowercase, with an optional `@scope/`), and `namespace` follows the kernel's namespace rule. The folder must not exist or must be empty (`kvbuilder/FOLDER_NOT_EMPTY`). A failed `npm install` fails `kvbuilder/NPM_FAILED` with the last lines of its output and keeps the written files; `npm` or `npx` missing from the PATH fails `kvbuilder/NPM_FAILED` too (ADR 0009, 121, 126).
- **`ext list`** walks the workspace folder, itself included (`.`), skipping `node_modules` and dot-folders, and doesn't look inside a project it found (ADR 0009, 126).
- **`preset new`** writes `{ "name": <name>, "extensions": { "@kvman/kvai": "bundled", "@kvman/kvwebui": "bundled" }, "settings": { "kvwebui.home": "kvwebui.extensions" } }`, which runs as-is; an existing file fails `kvbuilder/FILE_EXISTS` (ADR 0009, 123).
- **`preset check`** (ADR 0009, 122):
  - extensions: a `bundled` name must be a bundled extension (the bundled extensions are always available to the check); a `path:` folder, relative to the preset file, must hold a package.json with a `kvman` field; an `npm:` source is checked for its format only;
  - settings: a key's namespace must be `kernel` or one of the preset's extensions'; a loaded extension's key must be registered, and its value must match its schema (zod's `z.fromJSONSchema`);
  - pages: `kvwebui.home` must be a built-in page, a page from a loaded extension's `ui.get`, or a page under an unloaded extension's namespace.
- **Jobs.** The connector commands are public. Timeouts: `kvbuilder.ext.new` 10 minutes, `kvbuilder.ext.check` 5, `kvbuilder.ext.test` 10, and `kvbuilder.preview.start` 5, and `kvbuilder.preview.command.run` and `kvbuilder.preview.query.get` 2; every kvbuilder command has `retries: 0` (ADR 0009, 126).
- **Errors.** `kvbuilder/FOLDER_NOT_EMPTY`, `kvbuilder/FILE_EXISTS`, `kvbuilder/NOT_A_PROJECT`, `kvbuilder/NPM_FAILED`, `kvbuilder/NO_FREE_PORT`, and `kvbuilder/PREVIEW_FAILED` (ADR 0009, 126).

## 9.2 The scaffold and the guides

The scaffold, the kernel-level guides, `preset new` and `preset check`, and the preview are `@kvman/testkit` bins (§10): `kvman-new`, `kvman-preset`, and `kvman-preview`, next to `kvman-check`. Each takes the fields of its connector as flags, with the folder or file as an argument (`--name`, `--namespace`, `--web`), and with `--json` prints the connector's output, so a person, another harness, and kvbuilder share one implementation (ADR 0010, 2). kvbuilder declares `@kvman/testkit` in its own package.json, resolves the bins and the `docs/` folder from its own node_modules, and runs a bin as a child process with the running Node. It never imports the testkit (ADR 0010, 3).

`kvman-new` also writes `AGENTS.md` and a one-line `CLAUDE.md` that points to it (ADR 0010, 9): `AGENTS.md` says the folder is a kvman extension, to read `docs/` first, to run `kvman-docs list` and `kvman-docs get` for the docs of the extensions it builds on, to run `npm run check` and `npm test` after each change, and not to edit `dist/`; both are English. It copies the three kernel-level guides (`sdk`, `i18n`, `presets`, as Markdown from the testkit's `docs/`) into the project's `docs/` folder, so any harness or person can read them there (ADR 0010, 2, 17). The guides of the other concepts belong to the extensions that own them: kvwebui's `views` and `components`, kvcoder's `connectors` and `sections`, kvai's `models` and `providers`, and kvbuilder's `building` (§9.5). `docs get` reads the testkit's copy of the built-in ones, since it works before a project exists.

`kvman-new` writes the sample `<namespace>.docs.list` and `<namespace>.docs.get` (§9.5) over `extension-docs/usage.md`, and:
- `package.json`: `main` (`dist/index.js`), a `kvman` field (namespace, `source: "src/index.ts"`, dependencies: `{}`, plain or web, ADR 0009, 128), `@kvman/sdk` as a peerDependency, and devDependencies `typescript`, `@types/node` (ADR 0009, 127), `@kvman/sdk`, and `@kvman/testkit`, pinned to the versions that the running kvman bundles, plus the scripts `build` (for publishing), `check`, and `test`;
- `src/index.ts`, in erasable TypeScript, which a `path:` extension loads directly (§2.9), so edits need no build step. It registers a public query `<namespace>.greeting.get` (a sentence) and a `<namespace>.ui.get` with a page `hello` and a nav item that shows the greeting (ADR 0009, 118);
- `locales/en.json` and `locales/ar.json`;
- `test/extension.test.ts`, a passing `node:test` test that uses `createTestKernel`;
- `tsconfig.json` and `README.md`.

With `web: true`, it also writes:
- `web/components/Hello.vue`, a sample component styled with kvwebui's CSS variables and typed with `@kvman/sdk/web`, shown on the `hello` page;
- a Vite library build (`vue` external), one build per component, into `dist/web/components/<name>.js` and `.css`, the `kvman.web: "dist/web"` field, and the scripts `web:build` and `web:watch`;
- devDependencies `vite`, `@vitejs/plugin-vue`, and `vue`, pinned to the versions kvwebui uses.

The versions the scaffold pins are a testkit constant, which a test checks against the monorepo (ADR 0009, 126).

The toolchain comes from the project, so neither kvbuilder nor the scaffold's bins import TypeScript. The scaffold's `check` script is `kvman-check`, a bin of `@kvman/testkit` (§10). It loads the extension in a test kernel and prints readable findings, or with `--json` the `[{ file?, message, hint }]` array; it exits 1 on an error and 0 with only warnings (ADR 0009, 116). It reports:
- the failed load, when the kernel refuses the extension: invalid registrations, names outside the namespace, missing descriptions, bad catalogs (one at a time, since a load stops at its first error);
- each top-level input field of a public command or query with no description;
- missing locale keys: a key in one shipped catalog but not another, every key the `<namespace>.ui.get` answer uses, `<namespace>.title`, and each setting's `<key>.title`;
- warnings from a text scan of `src/**/*.ts`, skipping comments: every `setInterval(`, and every `setTimeout(` whose statement doesn't start with `await` (§2.2).

A TypeScript error is `{ file: "src/index.ts:12:5", message: "TS2322: …", hint }`, with paths relative to the project (ADR 0009, 117).

## 9.3 Preview

`kvman-preview` is the preview run in a terminal's foreground, by a person or any harness. It starts the `kvman` on the PATH, or the entry given with `--kvman <entry>`, prints its URL when the preview answers, and keeps running until SIGINT or SIGTERM, which stops the preview and its `web:watch` processes and removes its home (ADR 0010, 2, 7, 21). Through kvbuilder, `preview start` runs `kvman-preview` through the kernel's process service (`ctx.processes`, §2.16) in the workspace folder, with `--kvman` set to the running kvman's entry file (`process.argv[1]`, which every worker sees as the main thread does, §2.2) and `--name` set to the workspace id, and reads the ready line from the process log. The bin does the rest (ADR 0009, 114, 126):
- its own temporary home, `<os temp>/kvman-preview-<name>`, so it never touches real data: emptied at each start, and removed when the preview stops, and by kvbuilder when the bin was killed without cleaning up (ADR 0009, 125);
- port 3738, or the next free one up to 3837 (`kvbuilder/NO_FREE_PORT`);
- `--yes` and `--no-open`;
- a generated preset: the dev extensions as `path:`, plus kvai and kvwebui, with `kvwebui.home` set to `kvwebui.extensions` (or the given preset, with its `path:` entries made absolute and the dev extensions added, replacing entries of the same name; it keeps its own home) (ADR 0009, 119, 126).

For each project with a `web:watch` script, it first runs `npm run web:build` once, then runs `web:watch` through `ctx.processes` (as `web-<n>`; the preview is `preview`), so component edits rebuild; a page refresh then shows them (§6.4).

It returns `{ url }` once the preview answers `kernel.health.get`; after 30 s, or when the preview exits first, it stops what it started and fails `kvbuilder/PREVIEW_FAILED` with the last log lines (ADR 0009, 124). kvcoder's result card shows the URL as a link (§8.7, ADR 0009, 120). `path:` hot reload applies edits live. A second `preview start` fails `PROCESS_RUNNING`. `preview stop` ends the preview and its `web:watch` processes (`NOT_FOUND` when none runs), and they also stop with the main kvman. kvbuilder's `kernel.process.exited` handler stops the `web:watch` processes and removes the home when the preview exits by itself.

**Calling the preview** (ADR 0022, 8 and 14). `preview query-get` and `preview command-run` send `POST <url>/api/queries/<name>` and `POST <url>/api/commands/<name>` with the body `{ input }` (plan 04 §4.1) to the URL of the running preview, so the call runs in the preview's Home. They answer what the preview answered: `{ ok: true, output }`, or `{ ok: false, problem }` with the Problem of the failed call, so the agent reads a failure of its own extension as data. With no preview running they fail `NOT_FOUND`; a preview that doesn't answer within the job's 2 minutes, or answers something else, fails `kvbuilder/PREVIEW_FAILED`. Neither asks the person: the preview's home is temporary. The address is always the preview's own `127.0.0.1` URL, which kvbuilder stored at `preview start`.

## 9.4 `/build-kvman`

The person starts building kvman; the agent never does (ADR 0027). kvbuilder registers the slash command `/build-kvman` with kvcoder (plan 08 §8.4): `kvcoder.slash.register { commands: [{ name: 'build-kvman', description: 'kvbuilder.slash.build-kvman', command: 'kvbuilder.build.start', message: 'kvbuilder.slash.build-kvman.message' }] }`. The send box runs the command, then sends the text after `/build-kvman` as the person's message, or with none the translated line "I want to change this app." (plan 08 §8.7; ADR 0027, 2, 3, and 9).

`kvbuilder.build.start { sessionId, argument }` → `{}` is public and does three things, in this order (ADR 0027, 12):

1. enables its five connectors for the session, `kvcoder.connector.enable { sessionId, names: ['kvman', 'ext', 'preset', 'preview', 'docs'] }`, first, so a session that kvcoder refuses leaves nothing behind;
2. sets the session section `guide`, `kvcoder.section.set { id: 'guide', title: 'Building kvman', order: 20, sessionId, content }`, with the text of `docs/guide.md`, which is not a page of `kvbuilder.docs.get`; a section is in every prompt of the chat, so a summary never drops it;
3. only when the section wasn't there before, adds the note `kvbuilder.build.started` ("Building kvman is on for this chat") with `kvcoder.note.add`.

It ignores `argument`, which the send box sends. A second `/build-kvman` in a chat renews the guide and adds no second note. Nothing switches building off: a new chat starts without it (ADR 0027, 11). There is no `kvman init` and no `kvbuilder.app.guide.get` (ADR 0027, 13). kvcoder's Problems pass through: `kvcoder/SESSION_NOT_FOUND` for an unknown session, and `VALIDATION_FAILED` for a subagent's.

The guide has three parts, in this order (ADR 0023, 4):

- **Who and what to ask.** Settle which app is meant (kvman, changed with the `kvman` connector, or the project in the workspace folder, edited with `fs`), asking once with `ask choice` unless the request is clear. Find out what the person wants in their own words: one `ask text` when the goal isn't known, and otherwise only what is missing, one question per `ask` call, with outcomes as options and the recommended one first, never what `extensions-list`, `settings-list`, or `preset-get` would answer.
- **The rules for a person who isn't a developer.** No extensions, namespaces, presets, setting keys, or commands in what is asked or said, or in a call's `description`, which is the approval card's text; the agent chooses the mechanism. Look before building, and choose the smallest thing: a setting, an installed extension, an extension to build, a new preset only for a different app, and say plainly when kvman can't do it. Show before changing: preview an extension, give its address, and `ask confirm` before it is added. Say how to undo each change, after a change to the extensions, make one `kvman restart` call whose `description` says what stops, tell them that the terminal may ask them to trust the extension and that the page may need a reload, read `health-get` afterwards and, if it has `rolledBack`, say that the change was undone and why; and say what is unchecked.
- **The method** (ADR 0022, 12 to 15): **building an extension** in order (read the guides with `docs get`, `ext new`, edit the files with `fs`, `ext check`, `ext test`, `preview start`, check it with `preview command-run` and `preview query-get`, then `kvman extensions-install` with `path:<folder>`, and `kvman restart` to apply it); **improving an extension that exists** (read its code and its docs page first, change the smallest thing, then `ext check`, `ext test`, and the preview); and **managing the app** (the reads show its state, `query-get` uses what is installed, the person is asked before each change, a change to the extensions applies at the next start, which `kvman restart` makes, and kvcoder's own workers, MCP servers, and connectors are the settings `kvcoder.delegate.workers`, `kvcoder.mcp.servers`, `kvcoder.connectors`, and `kvcoder.connectors.disabled`). It says to use the `kvman`, `ext`, `preset`, `preview`, and `docs` connectors for everything they cover and the shell for the rest, and to edit a project's files with `fs` (ADR 0009, 170).

The text is English, as text for a model is (§2.11, ADR 0009, 126).

## 9.5 Documenting an extension

Any extension may tell others how to use it, so that an agent building a new extension can use what is installed (ADR 0010, 15–18). It registers two public queries, which kvbuilder pulls (as kvwebui pulls `<namespace>.ui.get`); nothing is registered with kvbuilder, and there is no load order:

| Query | Input → output |
|---|---|
| `<namespace>.docs.list` | `{}` → `[{ topic, title }]` |
| `<namespace>.docs.get` | `{ topic }` → `{ topic, title, markdown }` |

- `topic` is a kebab-case segment (`^[a-z0-9]+(-[a-z0-9]+)*$`); `title` and the Markdown are English, as text for a model is (§2.11).
- An extension is documented only when both are public queries. A private one is ignored; one of the two missing is ignored too.
- kvbuilder's `docs list` calls `<namespace>.docs.list` on each loaded extension that has the pair, and `docs get` calls `<namespace>.docs.get`. An answer that fails, or doesn't match, is shown for that extension as its Problem; it hides no other extension. `docs get` of an unknown topic is the extension's own `NOT_FOUND`.
- kvbuilder's `docs` connector is backed by `kvbuilder.guides.list` and `kvbuilder.guides.get`, which gather every extension's pages; `kvbuilder.docs.list` and `kvbuilder.docs.get` are kvbuilder's own pair, under this same convention (ADR 0010, 22).
- The core extensions document themselves this way, and none is required: kvwebui `views` and `components`, kvcoder `connectors` and `sections`, kvai `models` and `providers`, kvbuilder `building` (ADR 0027, 15). Each keeps its pages as Markdown in its own `docs/` folder. A person who removes them all, or all but one, loses only their pages.
- `kvman-docs list|get` (testkit, §10) gives the same pages to any harness: it takes the port from `<home>/kvman.lock` (`--home`, `KVMAN_HOME`, or `~/.kvman`) or `--url`, reads `kernel.extensions.list`, calls each pair over HTTP (§4), and with `--json` prints the data. It also lists the built-in guides, read from the testkit with no kvman running. With no kvman running, `list` prints the built-in guides and says on stderr to start kvman; `get` of an extension's topic exits 1.
- The scaffold's pair serves the Markdown pages of the project's `extension-docs/` folder (§9.2).
