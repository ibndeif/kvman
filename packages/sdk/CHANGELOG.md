# @kvman/sdk

## 0.1.1

### Patch Changes

- 85e9ff8: Three kernel commands: `kernel.preset.settings.set { key, value }` and `kernel.preset.settings.reset { key }` edit one value of the running preset's `settings` in its file (`{ file, restartRequired: true }`, applied at the next start, as `kernel.extensions.install` does), and `kernel.presets.save { preset, replace? }` writes a preset to `<home>/presets/<name>.json` so that `kvman --preset <name>` can start it later (ADR 0030).

## 0.1.0

The first published version. What it holds, in the order it was built:

- Create the empty `@kvman/sdk` and `@kvman/testkit` packages.
- Add the extension API: the `Ctx` types with typed `exec` through the `Commands`, `Queries`, and `Settings` maps, `z`, and the zod schemas for the manifest, the preset, Problems, job and file rows, workspaces, and the HTTP envelope.
- Let a `Json` object field be `undefined`, so collection schemas with optional fields fit the store.
- Export `package.json`, so the kernel can check extensions' `@kvman/sdk` peer ranges against its own copy.
- Add the schemas and types of the kernel's own commands and queries (`kernelCommandSchemas`, `kernelQuerySchemas`), so `ctx.exec('kernel.…', …)` is typed.
- `registerCommand` takes `syncOnly`: a sync-only command can't be queued or scheduled, so its input (a secret, for example) never lands in a job row.
- `@kvman/sdk/web`: types for kvwebui's custom components, the injected `kvman` object (`Kvman`, with its `StreamEvent`s) and view trees (`View`). Types only.
- The `kvman` object that kvwebui injects into custom components gains `refresh()`, which reruns the page's queries and the status items.
- The schemas of the kernel's new query `kernel.folder.list` (`{ path?, hidden? }` → `{ path, parent, folders, truncated }`), and `folderListSchema`.
- The schemas of the kernel's new command `kernel.folder.create` (`{ path, name }` → `{ path }`).
- Add `presetOriginSchema` and `presetStateSchema`, and the schemas of `kernel.preset.get`, `kernel.extensions.install`, and `kernel.extensions.uninstall`.
- The kernel has a new public query, `kernel.registrations.list`: every command and query of the run's extensions with its kind, owner, `public`, and description, and no schema. The SDK types it and exports `registrationRowSchema`.
- `@kvman/sdk/web` gains the `setting` view (`{ type: 'setting', key }`, one of the extension's own settings as a row, valid only in a `ui.get` `configuration`) and `Kvman.scope`, a live read-only ref that says where the extension's page is set to save (`'global'` or `'workspace'`) (ADR 0014).
- `kernelCommandSchemas` gains `kernel.restart` (`{}` → `{ restarting: true }`), and `healthSchema` gains the optional `rolledBack`, the Problem of the start that was undone before this one (ADR 0024, 2 and 6).
- An extension is installed by its source alone (ADR 0025). `kernel.extensions.install` takes `{ source }`, where `source` is `bundled:<name>`, `npm:<name>@<exact version>`, or `path:<folder>`, whose name the kernel reads from the folder's package.json; `@kvman/sdk` gains `installSourceSchema` and `InstallSource`. The Extensions page's form has one field, the source, and kvcustomizer's `kvman extensions-install` takes `{ source }`.
