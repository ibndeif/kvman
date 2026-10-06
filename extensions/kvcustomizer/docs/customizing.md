# Customizing kvman

kvcustomizer is the extension that lets kvman's agent build and manage kvman itself. It adds connectors to kvcoder and a short guide to the agent's prompt. It has no agent of its own, and everything it does for extensions is also available to any other harness, or to a person, through the testkit's command-line tools.

## The connectors

The agent calls each connector with kvcoder's `run` tool: `run { description, connector, command, payload }`. Every connector also has `help`, which describes its commands, and one command's payload with `{ "command": "<name>" }`.

| Connector | Commands | Use it to |
|---|---|---|
| `kvman` | `model-list`, `model-set`, `settings-list`, `settings-set`, `settings-reset`, `extensions-list`, `extensions-install`, `extensions-uninstall`, `preset-get`, `workspaces-list`, `jobs-list`, `jobs-get`, `processes-list`, `health-get`, `query-get` | see and change the app you are running in: its default model, settings, extensions, and preset; its workspaces, jobs, processes, and health; and any public query of an installed extension |
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
{ "description": "Adding the notes extension to the app", "connector": "kvman", "command": "extensions-install", "payload": { "name": "@acme/notes", "source": "npm:1.2.3" } }
{ "description": "Adding the notes project of this workspace to the app", "connector": "kvman", "command": "extensions-install", "payload": { "name": "notes", "source": "path:notes" } }
{ "description": "Finding the jobs that failed", "connector": "kvman", "command": "jobs-list", "payload": { "status": "failed", "limit": 20 } }
{ "description": "Listing the chats", "connector": "kvman", "command": "query-get", "payload": { "name": "kvcoder.session.list", "input": { "limit": 10 } } }
{ "description": "Previewing the notes project", "connector": "preview", "command": "start", "payload": { "extensions": ["notes"] } }
{ "description": "Reading the greeting in the preview", "connector": "preview", "command": "query-get", "payload": { "name": "notes.greeting.get" } }
{ "description": "Adding a note in the preview", "connector": "preview", "command": "command-run", "payload": { "name": "notes.item.add", "input": { "text": "Milk" } } }
{ "description": "Reading the views guide", "connector": "docs", "command": "get", "payload": { "extension": "@kvman/kvwebui", "topic": "views" } }
```

A command that takes nothing, such as `ext list`, `kvman preset-get`, `kvman health-get`, or `docs list`, needs no payload.

## Building an extension, step by step

1. **Read.** `docs list`, then `docs get` for `sdk`, and for `i18n` or `presets` when the work touches them; before building on an installed extension, its own pages.
2. **Scaffold.** `ext new { name, namespace, folder, web? }` writes the project and runs `npm install`.
3. **Write.** Edit `src/`, `locales/`, and `test/` with `fs`. Don't edit `dist/`.
4. **Check.** After every change, `ext check { folder }`, then `ext test { folder }`. `ext check` answers `[{ file?, message, hint }]`: TypeScript's errors first, then what kvman would refuse or show untranslated.
5. **Run.** `preview start { extensions: [folder] }` answers `{ url }`.
6. **Check that it works.** Call the project in the preview (below), and open its page at the URL.
7. **Install**, when the person asks: `kvman extensions-install { name, source: "path:<folder>" }`, then tell the person to restart kvman.

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

There is no `kvman` command that runs an arbitrary command of the app: a command is reached only through a connector that names it. There is also none that restarts kvman, or that opens or closes a workspace.

## Changing the app you run in

`kvman` is for the running app; `ext` is for a project in the workspace. Five commands change the app: `model-set`, `settings-set`, `settings-reset`, `extensions-install`, and `extensions-uninstall`.

- **The person is asked before each one runs.** The call becomes an approval card showing its description, the command, and its payload, whatever `kvcoder.shell.approval` says. Allowed, it runs; denied, the call answers `denied by the user` and nothing changed. Make one call for one change, and say in its `description` what changes.
- **Model and settings change at once.** `model-set` takes the full model id of a model `model-list` shows (a model of a connected provider or of a custom provider); `settings-set` and `settings-reset` take a setting key and a scope, `global` or `workspace`. `settings-set` replaces the whole value, so for a list read it with `settings-list` first.
- **Extensions and the preset change the preset file, and apply at the next start.** `extensions-install` takes a package name and a source, and `extensions-uninstall` takes a name. Both answer `{ file, restartRequired: true }`. Nothing is installed, loaded, or trusted by the call: tell the person to restart kvman, and the terminal asks them to trust a new extension then. The first change to the bundled preset saves a copy of it as `<home>/presets/<name>.json`.

The three sources of `extensions-install`:

| Source | Means | Checked by the call |
|---|---|---|
| `npm:<exact version>` | a published package | its format only |
| `path:<folder>` | a project in the workspace | the folder resolves against the workspace folder and must stay inside it (`VALIDATION_FAILED`); it must hold a package.json with a `kvman` field (`kvcustomizer/NOT_A_PROJECT`); that package's `name` must be the `name` given (`VALIDATION_FAILED`) |
| `bundled` | an extension that ships with kvman | the name must be a bundled extension's (`VALIDATION_FAILED`) |

A `path:` source is stored with the absolute folder, because kvman resolves a relative one against the preset file, not the workspace. A `path:` extension reloads when its files change.

kvcoder's own configuration is settings too: `kvcoder.delegate.workers` (the workers of `delegate`), `kvcoder.mcp.servers` (the MCP servers), `kvcoder.connectors` (programs as connectors), and `kvcoder.connectors.disabled` (the connectors that are off).

None of these calls reads, lists, or changes a secret.

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

`docs list` answers every page, grouped by extension. The built-in guides belong to `kvman`: `sdk`, `i18n`, and `presets`. Every installed extension that documents itself adds its own pages. An extension documents itself with two public queries:

- `<namespace>.docs.list` answers `[{ topic, title }]`;
- `<namespace>.docs.get` takes `{ topic }` and answers `{ topic, title, markdown }`.

A topic is a lowercase kebab-case word. kvcustomizer asks each extension itself, so nothing registers with kvcustomizer and no extension depends on it. An extension whose answer fails is listed with its error and hides no other. A project made with `kvman-new` already has the pair and a sample page in `extension-docs/usage.md`; `kvman-check` warns when the pair is half done.

## Previews

`preview start` runs a second kvman on its own temporary home, with the projects you name as `path:` extensions and kvwebui's Extensions page as its home page. Edits to a project's `src/` reload live, with no build. The preview takes the first free port from 3738 to 3837, and `preview stop` ends it and removes its home. A preview also stops when the kvman that started it stops.

### Calling a previewed project

`preview query-get { name, input? }` runs a public query of the preview, and `preview command-run { name, input? }` a public command. They call the preview's own HTTP API, in the preview's Home workspace, and never ask the person, because the preview's home is temporary. Both answer what the preview answered:

```json
{ "ok": true, "output": { "text": "Hello from notes!" } }
{ "ok": false, "problem": { "code": "VALIDATION_FAILED", "message": "…", "params": { } } }
```

A failure of the project's own command is therefore an answer to read, not a failed call. The call itself fails only when there is nothing to call: `NOT_FOUND` when no preview is running, and `kvcustomizer/PREVIEW_FAILED` when the preview doesn't answer or answers something that isn't kvman's. A query's name on `command-run`, or a command's on `query-get`, comes back as `{ ok: false }` with `NOT_FOUND`. Each call may take up to 2 minutes.
