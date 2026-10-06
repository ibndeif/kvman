# Documenting your extension

This page is for anyone whose extension other extensions, agents, or people will build on. When you finish, you can serve documentation pages from your extension, see them in `kvman-docs`, and know what `kvman-check` warns about.

## The pair

An extension documents itself by registering two public queries:

| Query | Input → output |
|---|---|
| `<namespace>.docs.list` | `{}` → `[{ topic, title }]` |
| `<namespace>.docs.get` | `{ topic }` → `{ topic, title, markdown }` |

- `topic` is a lowercase kebab-case word (`^[a-z0-9]+(-[a-z0-9]+)*$`). `title` and `markdown` are English, as text for a model is.
- Both must be `public: true`. An extension with one of the two missing, or private, simply isn't documented: nobody sees an error.
- `docs.get` of an unknown topic fails with the kernel's `NOT_FOUND`.

Nothing registers with anyone: kvbuilder **pulls** the pair from each loaded extension, as kvwebui pulls `ui.get`. So the pair works with kvbuilder installed or not, and in any preset.

```ts
const pages = { usage: 'Using notes' };

ctx.registerQuery('notes.docs.list', {
  description: 'Lists the documentation pages of notes.',
  public: true,
  input: z.object({}),
  output: z.array(z.object({ topic: z.string(), title: z.string() })),
  handle: () => Object.entries(pages).map(([topic, title]) => ({ topic, title })),
});

ctx.registerQuery('notes.docs.get', {
  description: 'Gives one documentation page of notes.',
  public: true,
  input: z.object({ topic: z.string() }),
  output: z.object({ topic: z.string(), title: z.string(), markdown: z.string() }),
  handle: (input) => {
    const title = pages[input.topic as keyof typeof pages];
    if (title === undefined) throw new ProblemError({ code: 'NOT_FOUND', message: `No page ${input.topic}.` });
    return { topic: input.topic, title, markdown: `# ${title}\n\n…` };
  },
});
```

## What `kvman-new` writes

A project from `kvman-new` already has the pair, served by `src/docs.ts` from the Markdown files in `extension-docs/`: each `extension-docs/<topic>.md` is a page, its title is the first line starting with `# `, and the sample is `extension-docs/usage.md`. Add a file and it appears. Include `extension-docs` in the package's `files` so it ships. The project's `docs/` folder is something else: the platform guides for whoever edits the project.

## Reading the pages

```sh
kvman-docs list                          # the platform guides, and every installed extension's pages
kvman-docs get @me/notes usage           # one page
kvman-docs get kvman sdk                 # a platform guide (sdk, i18n, presets), no kvman needed
```

`kvman-docs` asks the running kvman over HTTP (`--home`, `--url`, or `KVMAN_HOME` choose which one; kvman sets `KVMAN_HOME` for programs it runs). With no kvman running, `list` prints the three platform guides and says to start kvman. kvman's agent reads the same pages with its `docs` connector (`docs list`, `docs get`).

`docs list` and `kvman-docs list --json` answer `{ pages: [{ extension, topic, title }], problems: [{ extension, problem }] }`: an extension whose docs failed is listed in `problems` with its Problem and hides no other.

## The core extensions

kvwebui serves `views` and `components`, kvcoder `connectors` and `sections`, kvai `models` and `providers`, and kvbuilder `building`. None is required: remove them all and the pages go with them.

## What `kvman-check` warns about

Warnings, which don't fail the check:

- only one of `docs.list` and `docs.get` is registered;
- one of them isn't public;
- `docs.list` fails, or answers something other than `[{ topic, title }]`;
- a listed topic isn't kebab case, or `docs.get` fails or answers the wrong shape for it.

## Next

- [connectors.md](connectors.md)
- [testing.md](testing.md)
- [presets.md](presets.md)
