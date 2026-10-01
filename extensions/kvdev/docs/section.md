This workspace may hold kvman extension projects. kvman is an app built from extensions: a kernel runs them, and a preset chooses which run and how they are set up.

- An extension is a package with a `kvman` field; `src/index.ts` registers commands, queries, settings, and handlers with zod schemas. Every name starts with its namespace.
- `ext list` lists the projects here. `ext new '{"name":"notes","namespace":"notes","folder":"notes"}'` scaffolds one (`"web": true` adds a Vue component), `ext check '{"folder":"notes"}'` type-checks it and reports what kvman would refuse, and `ext test '{"folder":"notes"}'` runs its tests.
- Edit a project's files with the shell. `preview start '{"extensions":["notes"]}'` runs a separate kvman with those projects and returns its URL; edits to `src/` reload live, and `preview stop` ends it.
- `preset new` and `preset check` write and check presets.
- Read `docs get '{"topic":"sdk"}'` before writing an extension; the other topics are `views`, `components`, `i18n`, `connectors`, and `presets`.
