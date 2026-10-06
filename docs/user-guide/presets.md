# Presets

This page is for anyone who wants to choose what kvman runs, or to keep more than one setup. When you finish, you can read a preset, start kvman with your own, and understand how your changes to the extensions are kept.

## What a preset is

A preset is the whole app for one run: which extensions load, and the starting value of any setting. It is one small JSON file.

```json
{
  "name": "coder",
  "extensions": {
    "@kvman/kvai": "bundled",
    "@kvman/kvwebui": "bundled",
    "@kvman/kvcoder": "bundled",
    "@kvman/kvbuilder": "bundled"
  },
  "settings": {
    "kvwebui.title": "kvcoder.app.title",
    "kvwebui.home": "kvcoder.chat",
    "kvai.defaultModel": "anthropic/claude-sonnet-5-5"
  }
}
```

- `name` is what `kvman` shows for the preset.
- `extensions` lists each extension and where it comes from: `bundled` (ships with kvman), `npm:<exact version>`, or `path:<folder>` (a folder on this computer, relative to the preset file).
- `settings` gives starting values. You can still change most settings later on the Settings page. A few are **preset-only**: they show as locked there because only the preset sets them (for example which page is the home page, `kvwebui.home`).

kvman checks the preset when it starts. A preset with an unknown key, a bad value, or a missing required setting stops kvman with `VALIDATION_FAILED`, and the message says which.

## The bundled preset: `coder`

kvman ships one preset, `coder`, and runs it when you give no `--preset`. It loads four extensions: **kvai** (models), **kvwebui** (the web app), **kvcoder** (the chat and the agent), and **kvbuilder** (the tools that let the agent build and manage kvman). Its home page is the chat.

## Run a different preset

```sh
kvman --preset coder              # the bundled one (the default)
kvman --preset notes-app          # your own: <home>/presets/notes-app.json
kvman --preset ./notes-app.json   # a file, relative to the folder you start kvman in
```

How kvman reads the value:

- A value that contains `/` or `\`, or ends in `.json`, is a **file**, relative to the folder you started kvman from.
- Anything else is a **name**. kvman looks for `<home>/presets/<name>.json` first, then for a bundled preset of that name.
- A name or file that doesn't exist stops kvman with `VALIDATION_FAILED` and says where it looked.

If a kvman is already running on the same home, a second `kvman --preset …` with a different preset doesn't start another one: it fails with `KVMAN_RUNNING`. Stop the first one, or use `--home` for a separate kvman.

## Your own presets

Put them in `<home>/presets/` (by default `~/.kvman/presets/`). The quickest start is to ask the agent: "write a preset called notes-app" (it uses `preset new`), or run, from any terminal, `kvman-preset new notes-app.json --name notes-app` and then `kvman-preset check notes-app.json`. A new preset has kvai and kvwebui and shows the Extensions page as its home.

## Your `coder.json` replaces the bundled one

If you have `<home>/presets/coder.json`, kvman runs **that** file when you start it as `kvman` or `kvman --preset coder`, and never reads the bundled `coder`. This is how your changes stick, and it has one cost:

- The first time you install or remove an extension while running the bundled `coder`, kvman saves your own copy of it as `<home>/presets/coder.json` and edits that.
- From then on, your copy is the `coder` preset. It doesn't pick up changes to the bundled one, such as an extension that a newer kvman adds to `coder`.

To go back to the bundled preset, delete `<home>/presets/coder.json`.

## How your changes are kept

When you add or remove an extension on the Extensions page, or ask the agent to, kvman writes the change into the preset file that is running (your own file, the file you gave with `--preset`, or your copy of `coder`). The file is written whole or not at all, so a failed write never leaves it half done. The change applies at the next start; see [Extensions](extensions.md).

Settings you change on the Settings page are not written to the preset. They are stored by kvman and win over the preset's starting values.

## Next

- [extensions.md](extensions.md)
- [settings-and-secrets.md](settings-and-secrets.md)
- [building-kvman.md](building-kvman.md)
