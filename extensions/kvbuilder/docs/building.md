# Building kvman

kvbuilder ("kvman builder") is the extension that lets kvman's agent build and manage kvman itself. It adds nothing to a chat until the person types `/build-kvman` in it: then that chat gets kvbuilder's connectors and its guide. It has no agent of its own, and everything it does for extensions is also available to any other harness, or to a person, through the testkit's command-line tools (below).

## The connectors

The agent calls each connector with kvcoder's `run` tool: `run { description, connector, command, payload }`. Every connector also has `help`, which describes its commands, and one command's payload with `{ "command": "<name>" }`.

| Connector | Commands | Use it to |
|---|---|---|
| `kvman` | `model-list`, `model-set`, `settings-list`, `settings-set`, `settings-reset`, `extensions-list`, `extensions-install`, `extensions-uninstall`, `preset-get`, `preset-set`, `preset-reset`, `preset-save`, `workspaces-list`, `jobs-list`, `jobs-get`, `processes-list`, `health-get`, `query-get` | see and change the app you are running in: its default model, settings, extensions, and preset; its workspaces, jobs, processes, and health; and any public query of an installed extension |
| `ext` | `new`, `list`, `check`, `test` | scaffold an extension project in the workspace, list the projects, type-check one and see what kvman would refuse, run its tests |
| `preset` | `new`, `check` | write a preset file and check it before running it |
| `preview` | `start`, `stop`, `status`, `query-get`, `command-run` | run projects in a separate kvman, get its URL, and call their commands and queries there |
| `docs` | `list`, `get` | read the guides of kvman and the pages of every installed extension |

Folders and files are always relative to the workspace folder, and must stay inside it.

The payload is the command's input as JSON:

```json
{ "description": "Scaffolding the notes extension", "connector": "ext", "command": "new", "payload": { "name": "notes", "namespace": "notes", "folder": "notes" } }
{ "description": "Checking the notes project", "connector": "ext", "command": "check", "payload": { "folder": "notes" } }
{ "description": "Switching the default model", "connector": "kvman", "command": "model-set", "payload": { "model": "anthropic/claude-sonnet-5-5" } }
{ "description": "Adding the notes extension to the app", "connector": "kvman", "command": "extensions-install", "payload": { "source": "npm:@acme/notes@1.2.3" } }
{ "description": "Adding the notes project of this workspace to the app", "connector": "kvman", "command": "extensions-install", "payload": { "source": "path:notes" } }
{ "description": "Finding the jobs that failed", "connector": "kvman", "command": "jobs-list", "payload": { "status": "failed", "limit": 20 } }
{ "description": "Listing the chats", "connector": "kvman", "command": "query-get", "payload": { "name": "kvcoder.session.list", "input": { "limit": 10 } } }
{ "description": "Previewing the notes project", "connector": "preview", "command": "start", "payload": { "extensions": ["notes"] } }
{ "description": "Reading the greeting in the preview", "connector": "preview", "command": "query-get", "payload": { "name": "notes.greeting.get" } }
{ "description": "Adding a note in the preview", "connector": "preview", "command": "command-run", "payload": { "name": "notes.item.add", "input": { "text": "Milk" } } }
{ "description": "Reading the views guide", "connector": "docs", "command": "get", "payload": { "extension": "@kvman/kvwebui", "topic": "views" } }
```

A command that takes nothing, such as `ext list`, `kvman preset-get`, `kvman health-get`, or `docs list`, needs no payload.

## `/build-kvman`: starting to build kvman in a chat

Building kvman starts with the person, never with the agent. In a chat's send box they type `/build-kvman`, or `/build-kvman` followed by what they want ("/build-kvman add a notes page"). kvcoder then runs `kvbuilder.build.start { sessionId, argument }`, which:

- enables the five connectors for that chat only. They are registered with `optIn: true`, so no other chat has them in its prompt or can call them;
- sets the chat's prompt section `guide` from `docs/guide.md`: what to ask the person, the rules below, and the method of the next parts. A section is in every prompt of the chat, so a summary of the chat never drops it;
- sets the `installed` section, an index of the running preset, each installed extension's settings and public commands and queries, and its docs pages. Run `/build-kvman` again to renew this snapshot;
- adds the note "Building kvman is on for this chat", the first time.

On the Chat page the send box creates the chat first, so `sessionId` is the new chat's. The send box then sends the text after the command as the person's message, or "I want to change this app." when there was none, and the agent's turn starts. Running `/build-kvman` again in the same chat renews the guide and adds no second note. Nothing switches building off: a new chat starts without it. `guide` is not a page of `docs get`.

## Talking with a person who isn't a developer

The guide tells the agent to choose the mechanism and leave the person to choose the result:

- **Which app?** "The app" can mean kvman or the project in the workspace folder; the agent asks once, with a choice, unless the request is clear.
- **Ask about the result, and only what is missing.** One question per `ask` call, the options written as outcomes, the recommended one first. It never asks what `extensions-list`, `settings-list`, or `preset-get` would answer.
- **No kvman words.** Extensions, namespaces, presets, setting keys, and commands stay out of what the agent asks and says, and out of a call's `description`, which is the text of the approval card.
- **Look, then use the smallest thing.** A setting, then an extension that is installed, then one the agent builds, and a new preset only for a different app. If kvman can't do it, the agent says so.
- **Show before changing.** For an extension it built, the agent starts the preview, gives the address, and asks the person to confirm before it adds the extension to the app.
- **Undo and restart.** The agent says how to undo each change (`settings-reset`, `extensions-uninstall`), what is still unchecked, and, after a change to the extensions, restarts kvman (below).

## Building an extension, step by step

1. **Read.** `docs list`, then `docs get` for `sdk`, and for `i18n` or `presets` when the work touches them; before building on an installed extension, its own pages.
2. **Scaffold.** `ext new { name, namespace, folder, web? }` writes the project and runs `npm install`.
3. **Write.** Edit `src/`, `locales/`, and `test/` with `fs`. Don't edit `dist/`.
4. **Check.** After every change, `ext check { folder }`, then `ext test { folder }`. `ext check` answers `[{ file?, message, hint }]`: TypeScript's errors first, then what kvman would refuse or show untranslated.
5. **Run.** `preview start { extensions: [folder] }` answers `{ url }`.
6. **Check that it works.** Call the project in the preview (below), and open its page at the URL.
7. **Install**, when the person asks: `kvman extensions-install { source: "path:<folder>" }`, then `kvman restart`.

To improve an extension that exists, read its code and its docs page first, find what is wrong with `ext check`, `ext test`, and the preview, change the smallest thing, and run the checks again.

## Seeing the app you run in

These `kvman` commands only read, and never ask the person:

| Command | Payload | Answers |
|---|---|---|
| `model-list` | none | the models that can be called now: `[{ id, name, provider, isDefault }]` |
| `settings-list` | none | every setting: `[{ key, description, schema, scopes, value, source }]`, where `source` is `workspace`, `global`, `preset`, or `default` |
| `extensions-list` | none | the extensions that run: `[{ name, version, source, namespace, commands, queries, settings }]`, the last three as names |
| `preset-get` | none | the preset as stored now: `{ name, origin, file?, extensions, settings }` |
| `workspaces-list` | none | the open workspaces, Home first |
| `jobs-list` | `{ status?, limit }` | the async and scheduled jobs of the chat's workspace, newest first, each `{ id, name, input, status, attempts, retries, output?, problem?, createdAt, startedAt?, endedAt? }`; `status` is `queued`, `running`, `succeeded`, `failed`, or `cancelled`, and a failed job holds its `problem` |
| `jobs-get` | `{ id }` | one job of any workspace |
| `processes-list` | none | the long-lived processes: `[{ extension, workspaceId, name, pid, startedAt }]` |
| `health-get` | none | `{ version, preset, mode, workers, uptimeMs, languages }` |
| `query-get` | `{ name, input? }` | the output of the public query `name`, run with `input` (`{}` when left out) in the chat's workspace |

`query-get` runs a query of the kernel or of any installed extension, so the agent can use what is installed. It runs queries only:

- a command's name fails `VALIDATION_FAILED`;
- a name that no public query has (unknown, or private) fails `NOT_FOUND`;
- a name under `kernel.secrets.` fails `VALIDATION_FAILED`;
- the query's own failure comes back as it is.

There is no `kvman` command that runs an arbitrary command of the app: a command is reached only through a connector that names it. There is none that opens or closes a workspace.

## Changing the app you run in

`kvman` is for the running app; `ext` is for a project in the workspace. Six commands change the app: `model-set`, `settings-set`, `settings-reset`, `extensions-install`, `extensions-uninstall`, and `restart`.

- **The person is asked before each one runs.** The call becomes an approval card showing its description, the command, and its payload, whatever `kvcoder.shell.approval` says. Allowed, it runs; denied, the call answers `denied by the user` and nothing changed. Make one call for one change, and say in its `description` what changes.
- **Model and settings change at once.** `model-set` takes the full model id of a model `model-list` shows (a model of a connected provider or of a custom provider); `settings-set` and `settings-reset` take a setting key and a scope, `global` or `workspace`. `settings-set` replaces the whole value, so for a list read it with `settings-list` first.
- **Extensions and the preset change the preset file, and apply at the next start.** `extensions-install` takes a source, which carries the package name, and `extensions-uninstall` takes a name. Both answer `{ file, restartRequired: true }`. Nothing is installed, loaded, or trusted by the call: `restart` applies it, and the terminal asks the person to trust a new extension then. The first change to the bundled preset saves a copy of it as `<home>/presets/<name>.json`.

`restart` takes nothing and answers `{ restarting: true }`. kvman stops and starts again in the same process, with the same arguments, the same terminal, and no new browser tab, and the person is asked first. It stops running work: a chat's step that is running ends `interrupted` (the person sends a message to go on), long-lived processes such as a preview or a server the agent started stop, and an async job that didn't finish runs again if it has retries left. Open workspaces stay open. If kvman can't start with the change, because an extension is invalid or a setting fails, it puts the preset back as it was, starts again, and `health-get` has `rolledBack` with the failure's Problem; that is only for the start that follows. A new extension that isn't bundled still asks for trust in the terminal, so the agent says so.

The three sources of `extensions-install`:

| Source | Means | Checked by the call |
|---|---|---|
| `npm:<package name>@<exact version>` | a published package | its format only |
| `path:<folder>` | a project in the workspace | the folder resolves against the workspace folder and must stay inside it (`VALIDATION_FAILED`); it must hold a package.json with a `kvman` field (`kvbuilder/NOT_A_PROJECT`); kvman takes the extension's name from that package.json |
| `bundled:<package name>` | an extension that ships with kvman | the name must be a bundled extension's (`VALIDATION_FAILED`) |

A `path:` source is stored with the absolute folder, because kvman resolves a relative one against the preset file, not the workspace. A `path:` extension reloads when its files change.

kvcoder's own configuration is settings too: `kvcoder.delegate.workers` (the workers of `delegate`), `kvcoder.mcp.servers` (the MCP servers), `kvcoder.connectors` (programs as connectors), and `kvcoder.connectors.disabled` (the connectors that are off).

None of these calls reads, lists, or changes a secret.

## Editing the running preset and saving another app

`kvman preset-set { key, value }` changes one value of the running preset, such as `kvwebui.title` or `kvwebui.home`; `kvman preset-reset { key }` removes a preset value. Both ask the person and answer `{ file, restartRequired: true }`: restart once to apply the edits. For a setting the person may later change on the Settings page, use `kvman settings-set` instead.

For a separate app, write a workspace file with `preset new { name, file }`, edit its extensions and settings, run `preset check { file }`, and preview it with `preview start { extensions: [folder], preset: file }` (at least one project folder is required). After the person confirms, `kvman preset-save { file, replace? }` saves the preset by its own name in the home. Relative `path:` entries are resolved against the file's folder. It answers `{ file, name }`; the person starts it with `kvman --preset <name>`. Saving does not change the running app.

## The tools underneath

The connectors run the tools of `@kvman/testkit`, which you can run by hand in any terminal:

| Tool | Does |
|---|---|
| `kvman-new <folder> --name <name> --namespace <namespace> [--web]` | writes a project with its guides, `AGENTS.md`, and a docs page, then runs `npm install` |
| `kvman-check` | loads the project in a test kernel and reports what kvman would refuse or show untranslated |
| `kvman-preset new <file> --name <name>` and `kvman-preset check <file>` | writes and checks a preset |
| `kvman-preview <folder>…` | runs a preview kvman on a temporary home until you stop it |
| `kvman-docs list` and `kvman-docs get <extension> <topic>` | reads the same guides and pages as the `docs` connector from a running kvman |

## Docs: what `docs list` shows

`docs list` answers every page, grouped by extension. The built-in guides belong to `kvman`: `conventions`, `sdk`, `i18n`, and `presets`. Every installed extension that documents itself adds its own pages. An extension documents itself with two public queries:

- `<namespace>.docs.list` answers `[{ topic, title }]`;
- `<namespace>.docs.get` takes `{ topic }` and answers `{ topic, title, markdown }`.

A topic is a lowercase kebab-case word. kvbuilder asks each extension itself, so nothing registers with kvbuilder and no extension depends on it. An extension whose answer fails is listed with its error and hides no other. A project made with `kvman-new` already has the pair and a sample page in `extension-docs/usage.md`; `kvman-check` warns when the pair is half done.

## Previews

`preview start` runs a second kvman on its own temporary home, with the projects you name as `path:` extensions and kvwebui's Extensions page as its home page. Edits to a project's `src/` reload live, with no build. The preview takes the first free port from 3738 to 3837, and `preview stop` ends it and removes its home. A preview also stops when the kvman that started it stops.

### Calling a previewed project

`preview query-get { name, input? }` runs a public query of the preview, and `preview command-run { name, input? }` a public command. They call the preview's own HTTP API, in the preview's Home workspace, and never ask the person, because the preview's home is temporary. Both answer what the preview answered:

```json
{ "ok": true, "output": { "text": "Hello from notes!" } }
{ "ok": false, "problem": { "code": "VALIDATION_FAILED", "message": "…", "params": { } } }
```

A failure of the project's own command is therefore an answer to read, not a failed call. The call itself fails only when there is nothing to call: `NOT_FOUND` when no preview is running, and `kvbuilder/PREVIEW_FAILED` when the preview doesn't answer or answers something that isn't kvman's. A query's name on `command-run`, or a command's on `query-get`, comes back as `{ ok: false }` with `NOT_FOUND`. Each call may take up to 2 minutes.
