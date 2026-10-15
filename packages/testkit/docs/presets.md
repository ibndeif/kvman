# Presets

A preset is the whole app for one run: which extensions load, and the preset-level value of any setting.

```json
{ "name": "notes-app",
  "extensions": { "@kvman/kvai": "bundled", "@kvman/kvwebui": "bundled", "notes": "path:./notes" },
  "settings": { "kvwebui.home": "notes.list", "kvwebui.title": "notes.app.title" } }
```

- **Sources.** `bundled` (kvai, kvwebui, kvcoder, kvbuilder), `npm:<exact version>`, or `path:<folder>` relative to the preset file. A `path:` extension loads `kvman.source` with no build, and reloads on every save.
- **Dependencies.** Every extension that a listed one declares in `kvman.dependencies` must be listed too, in range; kvman loads them first.
- **Name.** Lowercase kebab case, such as `notes-app`; it is how `--preset <name>` finds a saved preset.
- **Settings.** Any registered key, checked against its schema once the extensions load. A key with no default must be set by the preset. `kvwebui.home` is required whenever kvwebui loads: a page with no params, such as `kvwebui.extensions`. `kvwebui.title`, the app's name, is a translation key of one of its extensions, such as `notes.app.title`.
- **Running.** `kvman --preset ./notes-app.json` (a file, relative to the start folder) or `kvman --preset notes-app` for `<home>/presets/notes-app.json`. Non-bundled extensions ask to be trusted at start.
- `kvman-preset new` writes a preset that runs as-is; `kvman-preset check` checks its schema, its extensions, its settings, and its home page.
- `kvman-preview --preset notes-app.json` runs it in a separate kvman with a temporary home. Without `--preset`, the preview runs kvai, kvwebui, the projects, and the bundled extensions they depend on.
- A preset changes which extensions run and their values; it never changes kvman's own code.
