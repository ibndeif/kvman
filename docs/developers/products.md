# Building a product on kvman

This page is for anyone who turns kvman into a product for people who aren't developers, such as a research assistant or a clinic's notes app. When you finish, you can give kvcoder's agent your product's identity and words, turn off the developer tools, hide kvman's own screens, show your extension's results as your own cards and artifacts, and ship the product as a desktop app of its own.

A product is a preset ([presets.md](presets.md)): the extensions it runs and their settings. Everything below is a setting of that preset, or something your extension registers.

## The preset

```json
{
  "name": "research",
  "extensions": {
    "@kvman/kvai": "bundled",
    "@kvman/kvwebui": "bundled",
    "@kvman/kvcoder": "bundled",
    "@acme/research": "npm:1.0.0"
  },
  "settings": {
    "kvwebui.title": "research.title",
    "kvwebui.home": "kvcoder.chat",
    "kvcoder.profile": {
      "identity": "You are a research assistant for PhD students.",
      "method": "general",
      "startHeading": "research.chat.heading",
      "placeholder": "research.chat.placeholder"
    },
    "kvcoder.connectors.disabled": ["shell", "fs", "mcp"],
    "kvwebui.nav.hidden": ["kvwebui.settings", "kvwebui.extensions"],
    "kvwebui.status.hidden": ["kvwebui.folder"],
    "kvwebui.workspacePicker": false
  }
}
```

## The agent: `kvcoder.profile`

`kvcoder.profile` is preset-only, `{}` by default, and strict. One profile serves the whole app.

| Field | Is |
|---|---|
| `identity` | 1 to 4000 characters: who the agent is, in your users' terms. It replaces "You are kvman Coder, the lead engineer…". A worker's first line starts with it too. |
| `method` | `engineering` (the default: kvcoder's full method, [the agent](../user-guide/the-agent.md)) or `general`: understand what the person wants, ask in one round what only they can decide, do the task with the connectors and workers, check the result, and give the result first in its answer. `general` has no execution map, no step-by-step plan, and no "ready for production"; the `execution-map` connector isn't offered. |
| `startHeading` | A translation key of yours: the Chat page's heading. It takes the `{workspace}` parameter. |
| `placeholder` | A translation key of yours: the new chat's send box text. |

The rules on evidence, asking, artifacts, and short replies stay in every method. Sections you set with `kvcoder.section.set` still come after the base prompt ([connectors.md](connectors.md#sections)).

## The tools: connectors and workers

- **`kvcoder.connectors.disabled`** lists connectors the agent doesn't have, kvcoder's own included. For people who aren't developers, turn off `shell`, `fs`, `mcp`, and the `delegate` worker programs your product doesn't need.
- **Your extension's connector** is how the agent does your product's work ([connectors.md](connectors.md)).
- **Workers** are the setting `kvcoder.delegate.workers`. Different models for different tasks are workers, each with its own model and thinking level; don't build "model profiles" of your own. A read-only worker can run your connector's commands whose target is a public query. A worker's brief should name the project's folder.

## The screens: kvwebui's preset settings

| Setting | Default | Does |
|---|---|---|
| `kvwebui.home` | `kvwebui.extensions` | The page at `/`. |
| `kvwebui.title` | `kvwebui.title.default` | The app's title, a translation key. |
| `kvwebui.nav.hidden` | `[]` | Nav items left out, by full id. It may name the built-in `kvwebui.settings` and `kvwebui.extensions`. A hidden page stays reachable by its address. |
| `kvwebui.status.hidden` | `[]` | Status items left out: a contributed one by full id (`<namespace>.<id>`), and `kvwebui.folder` for the workspace folder. kvman's version always shows. |
| `kvwebui.workspacePicker` | `true` | `false` hides the top bar's workspace picker. The tab stays in its workspace: Home, or the start URL's. |

All are preset-only except `kvwebui.nav.hidden`. When the nav hides `kvwebui.extensions`, the Chat page leaves out its approval line, since the person can't reach the setting.

Every text on a screen speaks to the product's users, never about how the product was built.

## Your results in the conversation

**Cards.** A command entry of your connector may name `card`, one of your own custom components ([components.md](components.md)):

```ts
{ name: 'search', command: 'research.source.search', card: 'research.source-cards' }
```

A successful call then shows your component with the props `{ payload, output }` in place of kvcoder's call card. A failed call keeps the call card, and the model reads the result as before. The component's namespace must be the namespace of the entry's `command` (`VALIDATION_FAILED` otherwise).

**Artifacts.** `kvcoder.artifact.write` and `kvcoder.artifact.edit` are public, with `{ sessionId, payload }` and the payload of the `artifact` connector (`{ id, title, format?, content }`, or `{ id, edits }`). Your extension can write or edit an artifact of any chat in the job's workspace, with the same limits as the agent, and the conversation shows it the same way.

## Your own work

- **Schedules** run only while there is work, and are cancelled when there is none: never a recovery job every minute, forever.
- **Dependencies** on the system: ask where the product runs before you choose one. Prefer npm packages with prebuilt binaries, since an `npm:` install runs with `--ignore-scripts`, and the desktop app brings only Node and npm.
- **The package** is published under a scoped name, such as `@acme/research` ([publishing.md](publishing.md)).

## Trying it

Run the preset with `kvman --preset ./research.json`, or preview your extension with `kvman-preview` ([preview-and-hot-reload.md](preview-and-hot-reload.md)). A preview has its own temporary home, so to try the chat there, add a model key on the preview's own Models page: no key is copied from your kvman, and the preview's key is deleted when the preview stops.

## Shipping it as a desktop app

A desktop app of its own reaches people who would never open a terminal. From kvman's repository:

```sh
pnpm desktop:brand ./brand.json
```

```json
{ "name": "Research Assistant", "id": "research", "preset": "./research.json", "icon": "./icon.png" }
```

| Field | Is |
|---|---|
| `name` | The app's name, 1 to 60 characters. It titles the window and the dialogs. |
| `id` | Lowercase kebab case, up to 40 characters. The app's identifier is `com.ibndeif.kvman.<id>`, and its home is `~/.<id>`. |
| `preset` | A preset file, relative to the brand file. It must pass the preset schema and use only `bundled` and `npm:` sources, so publish your extensions to npm first. |
| `icon` | A square PNG of at least 512 px, relative to the brand file. |

The command builds the app and its installers for the system it runs on. It prepares the runtime (Node, npm, and kvman), adds the brand and the preset, and tries kvman with that preset before it builds. A field that fails stops it with a message that names the field.

The app keeps its own chats, keys, and workspaces in `~/.<id>`, so it never meets a running kvman. It opens straight into the app with no home screen, and never updates itself: a new version is a new installer you send. The installers aren't code-signed in this phase.

## Next

- [presets.md](presets.md)
- [connectors.md](connectors.md)
- [components.md](components.md)
