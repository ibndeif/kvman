# Presets

This page is for anyone who chooses what kvman runs, or who builds an app out of extensions. When you finish, you can write a preset, run it, understand how a personal preset replaces a bundled one, and edit the running preset from the kernel API.

## The format

A preset is the whole app for one run:

```json
{
  "name": "notes-app",
  "extensions": {
    "@kvman/kvai": "bundled",
    "@kvman/kvwebui": "bundled",
    "@acme/export": "npm:1.2.3",
    "@me/notes": "path:../notes"
  },
  "settings": { "kvwebui.home": "notes.list", "kvai.defaultModel": "anthropic/claude-sonnet-5-5" }
}
```

- `name` is a non-empty string. A preset with an unknown key is invalid.
- `extensions` maps a package name to a source: `bundled` (a core extension that ships with kvman: kvai, kvwebui, kvcoder, kvcustomizer), `npm:<exact version>`, or `path:<folder>` (relative to the preset file).
- `settings` is the preset-level value of any setting. A key with no default must be set here; a preset-only key (`scopes: []`) can only be set here. `kvwebui.home` is required whenever kvwebui loads.

kvman validates the preset at start, and its settings again once the extensions have loaded. An unknown key, an invalid value, or a missing required key stops kvman with `VALIDATION_FAILED`.

## Running one

```sh
kvman --preset coder                 # the bundled preset (the default)
kvman --preset notes-app             # <home>/presets/notes-app.json
kvman --preset ./notes-app.json      # a file, relative to the folder you start kvman in
```

A value with `/` or `\`, or ending in `.json`, is a file. Any other value is a name: `<home>/presets/<name>.json` is looked at **first**, then a bundled preset. An unknown name or a missing file fails `VALIDATION_FAILED`. The one bundled preset is `coder`: kvai, kvwebui, kvcoder, and kvcustomizer, with `kvwebui.home` set to `kvcoder.chat`.

## A personal preset replaces a bundled one

If `<home>/presets/coder.json` exists, it **is** the `coder` preset: the bundled file is never read. That is how an edit to the running preset persists across restarts with a bare `kvman`. The cost: your copy doesn't follow later changes to the bundled preset.

## Editing the running preset

Three public kernel calls edit the preset **file**; none installs, loads, or trusts anything, and a restart applies the change:

| Call | Does |
|---|---|
| `kernel.preset.get` (query) | `{}` → `{ name, origin: 'bundled' \| 'home' \| 'file', file?, extensions, settings? }`: the preset as stored now. After an edit it shows the change before the restart. |
| `kernel.extensions.install` (command) | `{ source }` → `{ file, restartRequired: true }`. `source` is `bundled:<name>` (only for a bundled extension), `npm:<name>@<exact version>`, or `path:<folder>`, whose name is the `name` in the folder's package.json (a relative folder resolves against the preset file). The preset stores `bundled`, `npm:<exact version>`, or `path:<folder>` under that name. A name already present, or a bad source, fails `VALIDATION_FAILED`. |
| `kernel.extensions.uninstall` (command) | `{ name }` → `{ file, restartRequired: true }`. `NOT_FOUND` when it isn't there; `VALIDATION_FAILED`, naming the dependents, when another extension of the preset depends on it. |

- The file written is the person's: `<home>/presets/<name>.json` for a home preset, the given file for `--preset ./file.json`, and for the bundled preset its copy at `<home>/presets/<name>.json`, made at the first edit.
- Edits are written whole or not at all (a temporary file and a rename), in the key order `name`, `extensions`, `settings`, and one at a time: two at once both land.
- A write that fails, or a stored file that isn't valid, fails `VALIDATION_FAILED` naming the file; kvman never overwrites a file it couldn't parse.
- `kernel.settings.set` changes a setting at once and is **not** an edit of the preset.
- **Restart.** `kernel.restart` (command, `{}` → `{ restarting: true }`) makes kvman stop and start again in the same process, with its arguments, its lock, and its terminal, and no new browser tab; the preset is read again, so an edit applies. Jobs are aborted, processes stop, and workspaces open again.
- **The backup.** The first edit after a good start writes the preset as it was running to `<file>.good`; later edits keep it, and a start that succeeds deletes it. A start that fails with `EXTENSION_INVALID` or `VALIDATION_FAILED` while it exists restores the file from it, prints the Problem and "The last change to the preset was undone.", and starts once more; that start's `kernel.health.get` has `rolledBack` (the Problem). Any other failure, or a second one, exits 1 as before.

kvwebui's Extensions page and kvcustomizer's `kvman` connector (`extensions-install`, `extensions-uninstall`, `preset-get`) are built on these calls. The connector differs in one way: its `extensions-install` resolves a `path:` folder against the **workspace** folder, checks that it is a project, and stores the absolute folder, because the kernel's own command resolves a relative `path:` against the preset file.

## Tools

```sh
kvman-preset new ./notes-app.json --name notes-app    # a preset that runs as-is: kvai and kvwebui, the Extensions page as home
kvman-preset check ./notes-app.json                   # schema, extensions, settings, home page
```

`kvman-preset check` validates the schema and every `path:` folder (it must hold a `package.json` with a `kvman` field) with no kvman running. With a running kvman (found through `--home`, `KVMAN_HOME`, or `--url`) it also checks that a `bundled` name is one that kvman bundles, that each setting key belongs to `kernel` or to one of the preset's extensions and its value fits the schema, and that `kvwebui.home` is a built-in page or a page of a loaded extension. It prints findings as `{ file, message, hint }` and exits 1 when there are any.

## Trust

A preset can name code, so kvman asks before it runs a non-bundled extension version it hasn't accepted, in the terminal at start (`--yes` accepts). See [anatomy.md](anatomy.md).

## Next

- [kernel-api.md](kernel-api.md)
- [preview-and-hot-reload.md](preview-and-hot-reload.md)
- [publishing.md](publishing.md)
