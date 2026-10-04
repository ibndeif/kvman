# Pages and views

This page is for anyone who wants their extension to show something in kvwebui. When you finish, you can contribute pages, navigation, panels, and status items, build a page from the built-in components, use forms and buttons, and steer the UI from a handler with effects.

kvwebui is an extension like any other, and it is optional. It builds the web app from what other extensions contribute: it pulls them, nothing is pushed. An extension that kvwebui doesn't load has no UI, and nothing else breaks. `kvman-docs get @kvman/kvwebui views` prints the short reference served by kvwebui itself.

## Contributing: `<namespace>.ui.get`

Register a public query named `<namespace>.ui.get` that takes `{}` and returns:

```ts
{
  pages:  [{ id, title, params?: string[], view }],
  nav:    [{ id, page, title, icon, order }],     // icon: a lucide icon name, such as 'notebook'
  panels: [{ id, title, icon, view }],
  status: [{ id, query, input, text, params?, order }],
}
```

- Ids are local; the full id is `<namespace>.<id>`. Every title and text is a translation key ([localization.md](localization.md)).
- A page's URL is `/<namespace>/<page>`, followed by its params in order: `params: ['noteId']` gives `/notes/note/:noteId`.
- A **nav** item points at one of your own pages, one that has no params.
- A **panel** is a side area opened from a strip of icons; one is open at a time, and it shows on every page.
- A **status** item is a line in the status bar fed by a query: `text` is a key whose `params` may use `{ "$output": field, "format"?: "compact" | "usd" }` read from the query's output (a dotted path is allowed). Its query reruns after every command the UI runs, when a job the UI started ends, and every 30 seconds.
- The preset decides the home page: `kvwebui.home` is required, preset-only, and names a page with no params, such as `notes.list`.

kvwebui validates every answer. An extension whose answer is invalid, or whose `ui.get` fails, contributes nothing, and a dismissible error card names it; others are unaffected. An answer is invalid when it names an unknown component or a query that isn't public, a nav item points at a page with params or at a page that isn't yours, an id repeats, an icon isn't a lucide name, a form's command isn't a known public command, or a `$param` names a param its page doesn't declare.

```ts
ctx.registerQuery('notes.ui.get', {
  description: 'Gives the pages and navigation of notes.',
  public: true,
  input: z.object({}),
  output: z.json(),
  handle: () => ({
    pages: [{ id: 'list', title: 'notes.pages.list', view: { type: 'stack', direction: 'vertical', children: [
      { type: 'form', command: 'notes.note.add', submit: 'notes.add' },
      { type: 'table', query: 'notes.note.list', input: { limit: 100 }, columns: [{ field: 'text', title: 'notes.columns.text' }], empty: 'notes.empty' },
    ] } }],
    nav: [{ id: 'list', page: 'list', title: 'notes.pages.list', icon: 'notebook', order: 50 }],
    panels: [],
    status: [],
  }),
});
```

## View trees

A view is a JSON tree of built-in components. Every text is a translation key, with optional `params`. There is no expression language: a value may be `{ "$param": name }` (a route param) or `{ "$row": field }` (the current row, in table row actions and list items).

| Component | Shape |
|---|---|
| `stack` | `{ direction: 'vertical' \| 'horizontal', gap?: 'sm' \| 'md' \| 'lg', children }` |
| `card` | `{ title?, children }` |
| `heading` | `{ text, params?, level: 1 \| 2 \| 3 }` |
| `text` | `{ text, params? }` |
| `markdown` | `{ text, params? }` (translated Markdown) or `{ query, input, field }` (Markdown from data) |
| `table` | `{ query, input, columns, rowActions?, rowLink?: { page, params? }, empty? }` |
| `list` | `{ query, input, item: View, empty? }` |
| `detail` | `{ query, input, fields }` |
| `form` | `{ command, fixed?: { field: value }, submit, then? }` |
| `link` | `{ text, params?, to: { page, params? } }` |
| `button` | `{ text, command, input, confirm?, style?: 'primary' \| 'secondary' \| 'danger', then? }` |
| `custom` | `{ component: '<namespace>.<name>', props }` ([components.md](components.md)) |

There is no `tabs` component: ship a custom component for that.

- **Columns and fields** are `{ field, title, format?: 'text' | 'number' | 'date' | 'bytes' | 'boolean', secondary?, badges? }`. `secondary` names a second field shown under the first; `badges` maps values (as strings) to `{ text, tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }`.
- **Tables** return arrays of objects from a public query; `rowLink` makes each row open a page. A table with more than 10 rows shows a search box and its first 10 rows, and "Show more" adds 25.
- **Forms** build their fields from the command's input JSON Schema (minus the `fixed` fields): text, number, checkbox, a select for an `enum`, one item per line for an array, a group for a nested object, a password field for a `writeOnly` string, and a JSON field for anything else. A field's label is the key `<command>.fields.<field>`, or else its `.describe()` text. A form clears after its command succeeds, and a `VALIDATION_FAILED` marks each field named by an issue path.
- **`then`** is `'rerun'` (the default), `{ navigate: '<ns>.<page>', params? }`, or `{ toast: key, level? }`; its `params` may use `{ "$output": field }`.
- After a command succeeds, **every query on the page reruns**.

## Effects

A handler can steer the UI of whoever started the job. Call `ctx.exec('kvwebui.effect.add', effect)`; kvwebui stores the effect under your job's `rootId` and applies it when the job ends, after `then` or the error toast.

| Effect | Shape |
|---|---|
| toast | `{ type: 'toast', text, params?, level: 'info' \| 'success' \| 'warning' \| 'error' }` |
| navigate | `{ type: 'navigate', page: '<ns>.<page>', params? }` |
| panel | `{ type: 'panel', panel: '<ns>.<id>', open: boolean }` |
| refresh | `{ type: 'refresh' }` |

Effects older than one hour are cleaned up.

## Built-in pages

Below a divider, kvwebui shows **Settings** (`kvwebui.settings`) and **Extensions** (`kvwebui.extensions`). They can be a preset's `kvwebui.home` and the target of a `navigate` or `link`. The Extensions page lists what runs, installs and removes extensions, and marks what a restart changes ([presets.md](presets.md)).

## kvwebui's own settings

| Setting | Default |
|---|---|
| `kvwebui.title` | `kvwebui.title.default`; preset-only |
| `kvwebui.home` | none: required and preset-only |
| `kvwebui.nav.order` | `[]` |
| `kvwebui.nav.hidden` | `[]` |
| `kvwebui.theme` | `system` (`light`, `dark`); global only |

## Next

- [components.md](components.md)
- [localization.md](localization.md)
- [kernel-api.md](kernel-api.md)
