This workspace may hold kvman extension projects. kvman is an app built from extensions: a kernel runs them, and a preset chooses which run and how they are set up.

- An extension is a package with a `kvman` field; `src/index.ts` registers commands, queries, settings, and handlers with zod schemas. Every name starts with its namespace.
- `ext list` lists the projects here. `ext new '{"name":"notes","namespace":"notes","folder":"notes"}'` scaffolds one (`"web": true` adds a Vue component), `ext check '{"folder":"notes"}'` type-checks it and reports what kvman would refuse, and `ext test '{"folder":"notes"}'` runs its tests.
- Use the connectors `ext`, `preset`, `preview`, and `docs` for everything they cover, and the shell only for the rest. Edit a project's files with `fs`.
- `preview start '{"extensions":["notes"]}'` runs a separate kvman with those projects and returns its URL; edits to `src/` reload live, and `preview stop` ends it.
- `preset new` and `preset check` write and check presets.
- `docs list` shows every page: the built-in guides (`sdk`, `i18n`, `presets`) and the pages that installed extensions serve about themselves, such as the views and components of kvwebui. `docs get '{"topic":"sdk"}'` reads a built-in guide, and `docs get '{"extension":"@kvman/kvwebui","topic":"views"}'` reads an extension's page. Read the guides before writing an extension, and an extension's pages before building on it.
