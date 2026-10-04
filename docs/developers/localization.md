# Texts and languages

This page is for anyone whose extension shows text to people. When you finish, you can ship `en` and `ar` catalogs, name your keys by the conventions, translate errors and descriptions, and keep your pages right to left clean.

**Every text a person sees is a translation key.** Never put a user-facing sentence in a view, a toast, or an error as plain text.

## Catalogs

An extension ships `locales/<lang>.json` files: one flat JSON object of strings with every key under its own namespace.

```json
{
  "notes.title": "Notes",
  "notes.pages.list": "Notes",
  "notes.count": "Notes: {count}",
  "notes.errors.NOT_ALLOWED": "You can't do that to a note."
}
```

- kvman's own extensions ship `en` and `ar`; ship at least those two. You may ship any other language too.
- A key outside your namespace, or an unreadable file, fails the load with `EXTENSION_INVALID`.
- Placeholders use vue-i18n's `{name}`: `"notes.count": "Notes: {count}"`, filled by a view's `params` or by `kvman.t(key, { count })`. In a message, `@`, `|`, `{`, and `}` are special in vue-i18n: write a literal `@` as `{'@'}`.
- The kernel merges the catalogs per language and serves them at `GET /api/locales/:lang`. A key missing in a language falls back to `en`, then to the key itself.

## Key conventions

| Key | Is |
|---|---|
| `<namespace>.title` | the extension's display name |
| `<setting key>.title` | a setting's short title on the Settings page |
| `<name>.description` | a translated description of a setting, command, or query (otherwise the English `description` shows) |
| `<command>.fields.<field>` | a form field's label (otherwise the field's `.describe()` text) |
| `<namespace>.errors.<CODE>` | the text of an error code |

## Errors

Each error code you define needs a text. A Problem `notes/NOT_ALLOWED` is shown as `notes.errors.NOT_ALLOWED` with the Problem's `params` as placeholders. The kernel's codes are `kernel.errors.<CODE>`. The English `message` in a Problem is for logs and scripts, not for people.

## Languages and direction

`ar`, `he`, `fa`, and `ur` are right to left. Style your components with logical properties (`margin-inline-start`, `padding-block`, `inset-inline-start`, `text-align: start`) so pages mirror; never `margin-left`, `padding-right`, `left:`, or `text-align: left`.

Text sent to a model stays English: prompts, tool descriptions, and the pages you serve with `docs.get` are English.

## Checking

`npm run check` (`kvman-check`) reports:

- a key one catalog has and another lacks;
- every key your `ui.get` uses that is missing;
- a missing `<namespace>.title` or setting title.

## Next

- [views.md](views.md)
- [errors.md](errors.md)
- [components.md](components.md)
