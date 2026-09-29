# 06 — kvwebui (namespace `kvwebui`)

kvwebui is the web app, and it is an extension like any other. The kernel serves its `kvman.web` folder at `/` (§4.1). kvwebui builds the UI from other extensions' contributions, which it pulls; nothing is pushed. It holds no product concept: no chat, no agent. Pages, and what's on them, come from extensions, and the preset decides their order and the home page.

## 6.1 Stack

- Vue 3 (Composition API, TypeScript), built with Vite into `extensions/kvwebui/dist/web`.
- vue-router and Tailwind CSS, with logical properties only, so right-to-left works.
- vue-i18n, loading `/api/locales/:lang` for `kernel.language`.
- `lucide-vue-next` for icons.
- `markdown-it` with HTML disabled, its output sanitized with `DOMPurify`. `v-html` appears only in that one component.

## 6.2 The frame

```
┌─ <ui.title> ──── [workspace ▾] [EN|ع] [☾] ─┐
│ nav      │        page         │ ▣ panel  │
│ …        │                     │ strip    │
│ ──────   │                     │          │
│ Settings │                     │          │
│ Jobs     │                     │          │
│ Extensions                     │          │
├──────────┴─────────────────────┴──────────┤
│ contributed status items    built-in items │
└────────────────────────────────────────────┘
```

**Top bar.**
- The title is the `kvwebui.title` key.
- **The workspace picker** lists `kernel.workspace.list`. "Open folder…" takes a typed absolute path for `kernel.workspace.open`.
- A language switch sets `kernel.language`, and a theme switch sets `kvwebui.theme`.

**Nav.**
- One flat list, ordered by `kvwebui.nav.order`, then by each item's `order`. Items in `kvwebui.nav.hidden` are left out.
- Below a divider come the built-in pages: Settings, Jobs, and Extensions.

**Panels.** One is open at a time, chosen from a strip of panel icons. The open panel is remembered per tab in `localStorage`, and panels show on every page.

**Status bar.**
- Contributed items sit on the start side, ordered by `order`.
- The built-in items sit on the end side: the count of running jobs and the kernel's health.

**Workspace.**
- Each tab has a current workspace (default Home), remembered in `localStorage`. Every API call sends it as `workspaceId`.
- **Start URL.** When the page opens with `?workspace=<id>` (§1.2), kvwebui makes that the tab's workspace and removes the parameter from the URL. The workspace is never otherwise part of a URL.
- Closing a workspace moves its tabs to Home. A tab whose workspace was closed elsewhere learns it from a `NOT_FOUND` answer and moves to Home.

## 6.3 Contributions: `<namespace>.ui.get`

An extension contributes UI by registering the public query `<namespace>.ui.get`, which takes `{}` and returns:

```ts
{
  pages:  [{ id, title, params?: string[], view }],
  nav:    [{ id, page, title, icon, order }],     // icon: a lucide name
  panels: [{ id, title, icon, view }],
  status: [{ id, query, input, text, params?, order }],
}
```

- **Ids.** Ids are local to the extension; the full id is `<namespace>.<id>`. Titles and texts are translation keys.
- **Loading.** kvwebui reads `kernel.extensions.list` when the browser loads, and calls every `<namespace>.ui.get`. It validates each answer with zod.
- **Invalid UI.** An extension whose answer is invalid, or whose `<namespace>.ui.get` fails, contributes nothing. A dismissible error card lists the extension and its Problem, and the other extensions are unaffected. An answer is also invalid when:
  - it names an unknown component or a query that isn't public;
  - a nav item points at a page that has params.
- **Routes.** A page's URL is `/<namespace>/<page>`, followed by its params in order: `params: ['sessionId']` gives `/kvcoder/session/:sessionId`. `kvwebui.home` names the page shown at `/`; the default is the first nav item's page.
- **Status items.** A status item's `params` values may be `{ "$output": field }`, read from its query's output. Its query reruns after any command the UI runs, when a job the UI started ends, and every 30 s.

## 6.4 View trees

- A view is a JSON tree of built-in components. Every text is a translation key, with optional `params`.
- **References.** Inputs and `params` values may be `{ "$param": name }` (a route param) or `{ "$row": field }` (the current row, in table row actions and list items). There is no expression language.
- **Queries and commands.** Data components name a public query, and actions name a command.
- **Reruns.** After a command succeeds, every query on the page reruns.

| Component | Shape |
|---|---|
| `stack` | `{ direction: 'vertical' \| 'horizontal', gap?: 'sm' \| 'md' \| 'lg', children }` |
| `tabs` | `{ tabs: [{ title, view }] }` |
| `card` | `{ title?, children }` |
| `heading` | `{ text, params?, level: 1 \| 2 \| 3 }` |
| `text` | `{ text, params? }` |
| `markdown` | `{ text, params? }` (translated Markdown) or `{ query, input, field }` (Markdown from data) |
| `table` | `{ query, input, columns: [{ field, title, format?: 'text' \| 'number' \| 'date' \| 'bytes' }], rowActions?: button[], empty? }` |
| `list` | `{ query, input, item: View, empty? }` |
| `detail` | `{ query, input, fields: [{ field, title, format? }] }` |
| `form` | `{ command, fixed?: { field: value \| ref }, submit, then? }` |
| `link` | `{ text, params?, to: { page: '<ns>.<page>', params? } }`: navigation with no command; `params` fill the text, `to.params` fill the route |
| `button` | `{ text, command, input, confirm?, style?: 'primary' \| 'secondary' \| 'danger', then? }` |
| `custom` | `{ component: '<namespace>.<name>', props }` |

**Component details.**
- **Data.** Table and list queries return arrays of objects.
- **Forms.**
  - The fields come from the command's input JSON Schema (`kernel.extensions.list`), minus the `fixed` fields.
  - A field's label is the key `<command>.fields.<field>`, or else the field's description.
- **`then`.** `'rerun'` (the default), `{ navigate: '<ns>.<page>', params? }`, or `{ toast: key, level? }`. In `then`, `params` values may also be `{ "$output": field }`, a top-level field of the command's output. Effects (§6.5) apply after `then`.
- **Custom.**
  - It loads `/web/<namespace>/components/<name>.js`, which default-exports a Vue component.
  - kvwebui provides `vue` through an import map, so extensions build with `vue` as an external.
  - The component gets `props` and an injected `kvman` object: `exec`, `execAsync`, `stream(jobId)`, `follow(jobId)`, `t`, `workspace`, and `View`.
  - `stream(jobId)` gives the job's stream events (§4.4): `progress` chunks as `{ source, data }`, then `result` or `problem`. What the chunks mean is up to the extensions that send and read them.
  - `follow(jobId)` reruns the page's queries and applies the job's effects (§6.5) when the job ends.
  - `View` is a component that renders a view tree with kvwebui's built-in components: `<View :view="{ type: 'markdown', text }" />`. Custom components use it for Markdown, so the sanitized renderer stays the only `v-html`.

## 6.5 Effects: extensions controlling the UI

- **Adding effects.** A handler calls `ctx.exec('kvwebui.effect.add', effect)`. kvwebui stores the effect in its global store under the caller's `ctx.job.rootId` (job ids are unique across workspaces).
- **Applying effects.** When a job the UI started or follows ends (at the sync reply, or at the end of the stream for an async job), kvwebui calls `kvwebui.effect.take { jobId }`. That returns the job's effects, deletes them, and kvwebui applies them in order.
- **Cleanup.** kvwebui's `kernel.started` handler schedules `kvwebui.effect.clean` hourly with the key `effect-clean` (§2.4). It deletes effects older than 1 hour.

| Effect | Shape |
|---|---|
| toast | `{ type: 'toast', text, params?, level: 'info' \| 'success' \| 'warning' \| 'error' }` |
| navigate | `{ type: 'navigate', page: '<ns>.<page>', params? }` |
| panel | `{ type: 'panel', panel: '<ns>.<id>', open: boolean }` |
| refresh | `{ type: 'refresh' }` (reruns the page's queries) |

## 6.6 Built-in pages

| Page | Shows |
|---|---|
| **Settings** | Every key from `kernel.settings.list`, as a form built from its JSON Schema, with the scopes the key allows and each value's source. A secrets section sets and deletes secrets but never shows a value. |
| **Jobs** | `kernel.jobs.list` for the workspace, with status, and cancel for running jobs. |
| **Extensions** | `kernel.extensions.list`, read-only. |

## 6.7 Problems

- A failed command shows a toast with the translated `<ns>.errors.<CODE>` and its params. Inside a form, `VALIDATION_FAILED` also marks the fields it names.
- A failed query shows an error card in place of its component.

## 6.8 kvwebui's API and settings

| Name | Kind | Input → output |
|---|---|---|
| `kvwebui.effect.add` | command, public | an effect → `{}` |
| `kvwebui.effect.take` | command, public | `{ jobId }` → `effect[]` |
| `kvwebui.effect.clean` | command, private | `{}` → `{}` |

| Setting | Default |
|---|---|
| `kvwebui.title` | `kvwebui.title.default` ("kvman") |
| `kvwebui.home` | the first nav item's page |
| `kvwebui.nav.order` | `[]` |
| `kvwebui.nav.hidden` | `[]` |
| `kvwebui.theme` | `system` (`light`, `dark`); global only |
