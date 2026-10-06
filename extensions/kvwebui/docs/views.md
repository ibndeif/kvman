# Pages and views (kvwebui)

This page is served by `kvwebui.docs.get`, so `kvman-docs get @kvman/kvwebui views` and kvbuilder's `docs` connector read it.

An extension adds UI by registering the public query `<namespace>.ui.get`, which takes `{}` and returns:

```ts
{
  pages:  [{ id, title, params?: string[], view }],
  nav:    [{ id, page, title, icon, order }],     // icon: a lucide name, such as 'puzzle'
  panels: [{ id, title, icon, view }],
  status: [{ id, query, input, text, params?, order }],
  configuration?: view,                         // your extension's page under Extensions
}
```

- Ids are local; the full id is `<namespace>.<id>`. A page's URL is `/<namespace>/<page>`, followed by its params.
- Every title and text is a translation key (read the `i18n` guide with `kvman-docs get kvman i18n`).
- A nav item points at one of the extension's own pages with no params.
- An invalid answer contributes nothing, and kvwebui shows an error card naming the problem.
- `configuration` is a view like a page's, without params. kvwebui shows it on your extension's page, `/kvwebui/extension/<namespace>`, under a switch that says where changes are stored (all workspaces, or the open one), and above your extension's secrets. Build it from `setting` rows, headings, cards, and your own custom components.

## View components

| Component | Shape |
|---|---|
| `stack` | `{ direction: 'vertical' \| 'horizontal', gap?: 'sm' \| 'md' \| 'lg', children }` |
| `card` | `{ title?, children }` |
| `heading` | `{ text, params?, level: 1 \| 2 \| 3 }` |
| `text` | `{ text, params? }` |
| `markdown` | `{ text, params? }` (a translated key) or `{ query, input, field }` (Markdown from data) |
| `table` | `{ query, input, columns, rowActions?, rowLink?: { page, params? }, empty? }` |
| `list` | `{ query, input, item: view, empty? }` |
| `detail` | `{ query, input, fields: column[] }` |
| `form` | `{ command, fixed?, submit, then? }` |
| `link` | `{ text, params?, to: { page, params? } }` |
| `button` | `{ text, command, input, confirm?, style?, then? }` |
| `setting` | `{ key }`: one of your own settings as a row that saves as it changes; only in `configuration` |
| `custom` | `{ component: '<namespace>.<name>', props }` (see [Custom components](components.md)) |

- A column or field is `{ field, title, format?: 'text' \| 'number' \| 'date' \| 'bytes' \| 'boolean', secondary?, badges? }`.
- Values may be `{ "$param": name }` (a route param) or `{ "$row": field }` (the current row). There is no expression language.
- Data components name a public query; table and list queries return arrays of objects.
- A form's fields come from its command's input JSON Schema; a field's label is `<command>.fields.<field>`, or else its `.describe()` text.
- `then` is `'rerun'` (the default), `{ navigate: '<ns>.<page>', params? }`, or `{ toast: key, level? }`.
- After a command succeeds, every query on the page reruns.

## Example

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

A preset names the page shown at `/` with `kvwebui.home`, such as `notes.list`.
