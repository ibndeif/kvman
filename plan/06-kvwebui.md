# 06 — kvwebui (namespace `kvwebui`)

kvwebui is the web app, and it is an extension like any other. The kernel serves its `kvman.web` folder at `/` (§4.1). kvwebui builds the UI from other extensions' contributions, which it pulls; nothing is pushed. It holds no product concept: no chat, no agent. Pages, and what's on them, come from extensions, and the preset decides their order and the home page.

## 6.1 Stack

- Vue 3 (Composition API, TypeScript, single-file components), built with Vite into `extensions/kvwebui/dist/web`. The dependencies are listed, with versions, in ADR 0009, 66.
- vue-router and Tailwind CSS, with logical properties only, so right-to-left works.
- vue-i18n, loading `/api/locales/:lang` for `kernel.language`, with the fallbacks of §2.11.
- `@lucide/vue` for icons (the successor of the deprecated `lucide-vue-next`, with the same icon names).
- The IBM Plex Sans, IBM Plex Sans Arabic, and IBM Plex Mono fonts, bundled into the app.
- `markdown-it` with HTML disabled, its output sanitized with `DOMPurify`. `v-html` appears only in that one component.

## 6.2 The frame

```
┌─ <ui.title> ─ [workspace ▾] ── [🌐 English ▾] [☀ ▾] ─┐
│ nav      │        page         │ ▣ panel  │
│ …        │                     │ strip    │
│ ──────   │                     │          │
│ Settings │                     │          │
│ Extensions                     │          │
├──────────┴─────────────────────┴──────────┤
│ contributed status items    built-in items │
└────────────────────────────────────────────┘
```

**Top bar.**
- The title is the `kvwebui.title` key.
- **The workspace picker** lists `kernel.workspace.list`: each workspace's name and folder (Home is shown as "Home"), with a close button on each but Home (`kernel.workspace.close`). "Open a folder…" opens a dialog for a typed absolute path (`kernel.workspace.open`).
- A language menu lists the languages in `kernel.health.get`, each named in itself, and sets `kernel.language`; kvwebui then reloads the catalog and sets the page direction (§2.11). A theme menu (System, Light, Dark) sets `kvwebui.theme`.

**Nav.**
- One flat list, ordered by `kvwebui.nav.order`, then by each item's `order`, then by full nav id (`<namespace>.<id>`) alphabetically. Items in `kvwebui.nav.hidden` are left out.
- Below a divider come the built-in pages: Settings (`kvwebui.settings`) and Extensions (`kvwebui.extensions`), at `/kvwebui/<page>`. They can be `kvwebui.home` and the target of a `navigate` or `link`, and they're outside `kvwebui.nav.order` and `kvwebui.nav.hidden`. There is no built-in Jobs page: an extension that wants one contributes it (ADR 0009, 69).
- The nav can collapse to icons only, remembered in `localStorage`.

**Panels.** One is open at a time, chosen from a strip of panel icons. The open panel is remembered per tab, like the workspace, and panels show on every page.

**Status bar.**
- Contributed items sit on the start side, ordered by `order`.
- The built-in item sits on the end side: kvman's version with a green dot, or a red "offline" while `kernel.health.get` fails (ADR 0009, 69).
- A status item whose query fails shows a small error mark, with the translated Problem as its tooltip.

**Workspace.**
- Each browser tab has a current workspace (default Home). Every API call sends it as `workspaceId`. Reloading a tab keeps its workspace (`sessionStorage`), and a new tab opens in the workspace chosen last (`localStorage`) (ADR 0009, 74).
- **Start URL.** When the page opens with `?workspace=<id>` (§1.2), kvwebui makes that the tab's workspace and removes the parameter from the URL. An id that isn't open falls back to Home. The workspace is never otherwise part of a URL.
- Closing a workspace moves its tab to Home. A tab whose workspace was closed elsewhere learns it from a `NOT_FOUND` answer whose `params.workspaceId` is its workspace, and moves to Home with a toast.
- The browser tab's title is `<page> · <workspace> · <app title>`.

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
  - it names an unknown component or a query that isn't public (the kernel's own queries are public);
  - a nav item points at a page that has params, or at a page that isn't one of the extension's own;
  - an id repeats within `pages`, `nav`, `panels`, or `status`;
  - an icon isn't a lucide name;
  - a form's command isn't a known public command;
  - a `$param` names a param its page doesn't declare (ADR 0009, 72).
- A `link` or `navigate` to a page that doesn't exist shows a "page not found" card when it's followed.
- **Routes.** A page's URL is `/<namespace>/<page>`, followed by its params in order: `params: ['sessionId']` gives `/kvcoder/session/:sessionId`. `kvwebui.home` names the page shown at `/`.
- **The home page.** The preset decides it: `kvwebui.home` is required and preset-only (§2.8), so every preset that loads kvwebui names its home page, and the person can't change it in Settings.
  - When that page doesn't exist at load (its extension isn't loaded, its `ui.get` failed, or the page has params), `/` shows the built-in Extensions page with an error card: "Home page `<id>` isn't available" (`kvwebui.errors.HOME_UNAVAILABLE`), plus the Problem of the extension that should provide it, if any.
- **Status items.** A status item's `params` values may be `{ "$output": field }`, read from its query's output. Its query reruns after any command the UI runs, when a job the UI started ends, and every 30 s; so does the built-in health item.

## 6.4 View trees

- A view is a JSON tree of built-in components. Every text is a translation key, with optional `params`.
- **References.** Inputs and `params` values may be `{ "$param": name }` (a route param) or `{ "$row": field }` (the current row, in table row actions and list items). There is no expression language.
- **Queries and commands.** Data components name a public query, and actions name a command.
- **Reruns.** After a command succeeds, every query on the page reruns.

| Component | Shape |
|---|---|
| `stack` | `{ direction: 'vertical' \| 'horizontal', gap?: 'sm' \| 'md' \| 'lg', children }` |
| `card` | `{ title?, children }` |
| `heading` | `{ text, params?, level: 1 \| 2 \| 3 }` |
| `text` | `{ text, params? }` |
| `markdown` | `{ text, params? }` (translated Markdown) or `{ query, input, field }` (Markdown from data) |
| `table` | `{ query, input, columns: column[], rowActions?: button[], rowLink?: { page: '<ns>.<page>', params? }, empty? }` |
| `list` | `{ query, input, item: View, empty? }` |
| `detail` | `{ query, input, fields: column[] }` |
| `form` | `{ command, fixed?: { field: value \| ref }, submit, then? }` |
| `link` | `{ text, params?, to: { page: '<ns>.<page>', params? } }`: navigation with no command; `params` fill the text, `to.params` fill the route |
| `button` | `{ text, command, input, confirm?, style?: 'primary' \| 'secondary' \| 'danger', then? }` |
| `custom` | `{ component: '<namespace>.<name>', props }` |

There is no `tabs` component: an extension that wants tabs ships a custom component (ADR 0009, 68).

**Component details.**
- **Columns.** A table column or detail field is `{ field, title, format?: 'text' | 'number' | 'date' | 'bytes' | 'boolean', secondary?, badges? }`. `secondary` names a second field shown under the first as a muted line. `badges` maps values (matched as strings) to `{ text, tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }`, shown as a colored badge with the translated text; a value with no mapping shows nothing. `boolean` shows a check mark or a dash (ADR 0009, 75–76).
- **Tables.** `rowLink` makes each row open a page, with `$row` references in its params. Once a table has more than 10 rows, it shows a search box and its first 10 rows, and "Show more" adds 25.
- **Data.** Table and list queries return arrays of objects.
- **Forms.**
  - The fields come from the command's input JSON Schema (`kernel.extensions.list`), minus the `fixed` fields.
  - A field's label is the key `<command>.fields.<field>`, or else the field's description.
  - Fields follow the schema: text, number, checkbox, select for an `enum`, one item per line for an array of strings or numbers, a group for a nested object, a password field for a `writeOnly` string, and a JSON text field for anything else. A top-level `anyOf` of objects gives one form with every variant's fields (ADR 0009, 70). A form clears after its command succeeds.
- **`then`.** `'rerun'` (the default), `{ navigate: '<ns>.<page>', params? }`, or `{ toast: key, level? }` (level `success` by default). In `then`, `params` values may also be `{ "$output": field }`, a top-level field of the command's output. Effects (§6.5) apply after `then`.
- **Custom.**
  - It loads `/web/<namespace>/components/<name>.js`, which default-exports a Vue component, and `components/<name>.css` beside it when that exists. The URL carries the extension's `revision` (§2.12), so after a hot reload a page refresh loads the new code.
  - kvwebui provides `vue` through an import map, so extensions build with `vue` as an external. The kvdev scaffold sets this up (§9.2).
  - **Styling.** kvwebui defines CSS variables for light and dark: `--kv-color-*` (background, surface, text, muted, border, primary, danger, warning, success), `--kv-space-*` (`sm`, `md`, `lg`), and `--kv-radius`. Extensions style with these variables and logical properties; kvwebui's Tailwind classes aren't available to them.
  - **Types.** `@kvman/sdk/web` types the injected `kvman` object and view trees (§3.2).
  - The component gets `props` and an injected `kvman` object: `exec`, `execAsync`, `stream(jobId)`, `follow(jobId)`, `navigate`, `toast`, `panel`, `t`, `workspace`, and `View`.
  - `stream(jobId)` gives the job's stream events (§4.4): `progress` chunks as `{ source, data }`, then `result` or `problem`. What the chunks mean is up to the extensions that send and read them.
  - `follow(jobId)` reruns the page's queries and applies the job's effects (§6.5) when the job ends.
  - `navigate(page, params?)`, `toast(text, params?, level?)`, and `panel(id, open)` act at once in the browser, like the effects of the same name.
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
| **Settings** (`kvwebui.settings`) | Every key from `kernel.settings.list`, grouped by namespace (kvman's own first; a group's heading is `<namespace>.title` with the namespace, or the namespace alone). Each key shows its title (`<key>.title`, else the key), its description (`<key>.description`, else its English description), and a control built from its JSON Schema, with "Applies to: All workspaces \| This workspace" among the scopes the key allows, a badge saying where the value comes from, and a reset for a value set in the chosen scope. Preset-only keys are shown locked. A Secrets section lists `kernel.secrets.list` masked, deletes a secret after a confirmation, and adds one (extension, name, and a password field), never showing a value (ADR 0009, 77). |
| **Extensions** (`kvwebui.extensions`) | `kernel.extensions.list`, read-only: a card per extension with its name, version, source, and counts, which opens to list its commands and queries (with `<name>.description`, or the English description, and a "Public" badge), settings, and handlers; a search box filters commands and queries (ADR 0009, 78). |

## 6.7 Problems

- A failed command shows a toast with the translated `<ns>.errors.<CODE>` and its params. Inside a form, `VALIDATION_FAILED` also marks each field named by an issue path's first segment with `kvwebui.form.invalid` (ADR 0009, 71).
- A failed query shows an error card in place of its component, with "Try again".
- An error reads as a plain sentence, with a "Details" disclosure holding the code, the English message, and the params.
- Toasts sit at the bottom end corner; `info` and `success` close after 5 s, `warning` and `error` stay until closed. A button's `confirm` opens an in-app dialog. Loading shows placeholder rows, and an empty table or list shows its `empty` text (default `kvwebui.empty`). Formats use `Intl` in the UI language (ADR 0009, 75).

## 6.8 kvwebui's API and settings

| Name | Kind | Input → output |
|---|---|---|
| `kvwebui.effect.add` | command, public | an effect → `{}` |
| `kvwebui.effect.take` | command, public | `{ jobId }` → `effect[]` |
| `kvwebui.effect.clean` | command, private | `{}` → `{}` |

| Setting | Default |
|---|---|
| `kvwebui.title` | `kvwebui.title.default` ("kvman"); preset-only (`scopes: []`) |
| `kvwebui.home` | none: required and preset-only (`scopes: []`), a full page id without params |
| `kvwebui.nav.order` | `[]` |
| `kvwebui.nav.hidden` | `[]` |
| `kvwebui.theme` | `system` (`light`, `dark`); global only |
