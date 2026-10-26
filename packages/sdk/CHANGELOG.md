# @kvman/sdk

## 0.1.5

### Patch Changes

- 486d037: kvwebui embedded in a host, and who may frame kvman (ADR 0099, ADR 0100). kvman's answers carry a `frame-ancestors` policy, so only kvman itself, local pages, and VS Code can show it in a frame. kvwebui opened with `?embed=parent` runs inside a host's frame, such as the VS Code extension's view: it has no top bar, nav, or status bar, takes the host's colors and fonts, opens a pages menu when the host asks, and hands new windows to the host (a `target="_blank"` web link, or the new `kvman.open(url)`). The new `kvman.host` (typed in `@kvman/sdk/web`) asks the host to open a file, a diff, or a Git change, and receives text the host inserts. kvcoder's MCP sign-in opens its address with `kvman.open`. kvcoder at a narrow width puts History, the chat's header, and New chat in one row; embedded, it shows "Open diff" on file edits and writes (the new read-only query `kvcoder.file.preview.get` gives the proposed file), opens file paths in the host's editor, and puts text the host inserts into the send box.
- cc5845f: The VS Code view, reviewed (ADR 0101). The new `kvman.host.offerNew(handler)` (typed in `@kvman/sdk/web`) offers the host's New button while embedded; kvcoder's conversation offers it, and its compact header then drops its own New chat. Embedded kvwebui lists panels and a Language row in its pages menu, opens panels as a sheet, shows the status items in a slim line at the bottom, looks compact (smaller spaces and titles, thin scrollbars), and, when kvman stops answering, tells the host (`kvman.lost`) instead of showing a toast. The page's scrolling area now contains what it holds, so nothing stretches the document, and an identical toast that is open isn't shown again. kvcoder's composer keeps its pickers whole at side-bar width, and its menus close when the focus leaves them and open toward the side that has room.

## 0.1.4

### Patch Changes

- 1942677: Counts that read as words (ADR 0098). A catalog text may hold plural forms separated by `|`, one per plural category of its language (English two, Arabic six), and kvwebui chooses one by a numeric `count` param, in `kvman.t`, toasts, and contributed views and status items. kvman's own count texts use them: `1 file`, `Show 1 earlier message`, `1 provider`, `Allow this command?`, `1 turn`. A fold of calls reads as a sentence, `Read 3 files, changed 1 file, ran 1 command · 1 failed`, with each file counted once, `fs read-files` counted as a read, the failures in the danger color, and the words at the row's start. The testkit's i18n guide explains plural forms.

## 0.1.3

### Patch Changes

- d541dbc: `kvman.indexes` in an extension's manifest declares, per collection, the field sets it filters by (`storeIndexSchema`, `storeIndexesSchema`, `StoreIndexes`); the kernel builds them at start, and `find` and `count` use them, with the same results (ADR 0088, 3).

## 0.1.2

### Patch Changes

- 90fb869: A workspace whose folder is gone is closed at start. `kernel.workspace.closed.list` lists the closed workspaces, `kernel.workspace.delete` erases one for good after stopping its work, and the new point `kernel.workspace.deleted` tells extensions, in Home. The workspace picker has a "Closed workspaces" section with Reopen, Delete, and "Delete all missing"; kvcoder forgets a deleted workspace's background-process records (ADR 0061).
- 90fb869: Allow collection `find` to continue from an optional, exclusive `after` ID in either direction, including deleted or nonexistent cursor positions. Keep the required positive integer limit of at most 1000, ownership and filter semantics, Promise-based ordinary calls and synchronous transaction calls.
  
  The kernel implementation is part of the coordinated root release; updated SDK types alone do not enable this option on an older kernel. Separate pages do not share a snapshot. No stored format or migration is added.

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
