# Customizing kvman

kvcustomizer is the extension that lets kvman's agent build and manage kvman itself. It adds connectors to kvcoder and a short guide to the agent's prompt. It has no agent of its own, and everything it does for extensions is also available to any other harness, or to a person, through the testkit's command-line tools.

## The connectors

Each connector is a word the agent types in its shell tool, followed by a call and a JSON input.

| Connector | Calls | Use it to |
|---|---|---|
| `ext` | `new`, `list`, `check`, `test` | scaffold an extension project in the workspace, list the projects, type-check one and see what kvman would refuse, run its tests |
| `preset` | `new`, `check` | write a preset file and check it before running it |
| `preview` | `start`, `stop`, `status` | run projects in a separate kvman and get its URL |
| `docs` | `list`, `get` | read the guides of kvman and the pages of every installed extension |

Folders and files are always relative to the workspace folder, and must stay inside it.

```text
ext new '{"name":"notes","namespace":"notes","folder":"notes"}'
ext check '{"folder":"notes"}'
ext test '{"folder":"notes"}'
preset new '{"name":"notes-app","file":"notes-app.json"}'
preview start '{"extensions":["notes"]}'
docs list
docs get '{"extension":"@kvman/kvwebui","topic":"views"}'
```

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
