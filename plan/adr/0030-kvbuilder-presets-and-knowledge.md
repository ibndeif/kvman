# ADR 0030 — kvbuilder edits the running preset, saves a new one, and knows what is installed

The product owner asked (2026-10-07): "I want to edit kvman builder to teach him that the user able to edit current preset or create a brand new preset. Also it should have all required knowledge about all installed extensions and kvman patterns and convetions".

Three gaps stood in the way:

- The agent could change only the running preset's extensions. A preset-level setting value had no command, and the preset file is outside the workspace that `fs` reaches, so the app's name and home page (`kvwebui.title` and `kvwebui.home`, which only a preset sets) were out of reach.
- A new preset was a file in the workspace. Nothing put it where `kvman --preset <name>` finds it, and the guide gave presets one line.
- The agent learned about the installed extensions only by calling `docs list` and `docs get`, and kvman's conventions had no page.

Decisions 1 to 3 were asked with alternatives and mockups. Decisions 4 to 12 are the smallest way to carry them out; the product owner may overrule any of them.

## Decisions

1. **The agent edits the running preset's extensions and its setting values** (chosen over a guide with no new command, and over one command that replaces the whole preset).
2. **A brand-new preset is written, previewed, then saved by name** (chosen over a workspace file only, and over also switching the running app to it). The running app is untouched; the person starts the new one with `kvman --preset <name>`.
3. **`/build-kvman` gives the chat a live index of what is installed, and a new built-in guide holds the conventions** (chosen over every page in the prompt, and over a stronger wording with no index).
4. **`kernel.preset.settings.set { key, value }` → `{ file, restartRequired: true }`** sets one value in the stored preset's `settings`, and **`kernel.preset.settings.reset { key }` → `{ file, restartRequired: true }`** removes one. Both are edits of the preset as `kernel.extensions.install` is (plan 02 §2.10): the same file, the same backup, applied at the next start, undone when that start fails.
   - A key that is registered in this run has its value checked against its schema (`VALIDATION_FAILED`).
   - A key that isn't registered is taken unchecked only while the stored preset names an extension that isn't loaded in this run, since such an extension may need a value before its first start; otherwise it fails `VALIDATION_FAILED`. The next start checks every value (§2.8).
   - `reset` of a key the stored preset doesn't have fails `NOT_FOUND`; of a key that is registered without a default it fails `VALIDATION_FAILED`, since kvman couldn't start without it.
   - `kernel.settings.set` is unchanged: it changes a setting at once and is not an edit of the preset.
5. **`kernel.presets.save { preset, replace? }` → `{ file }`** writes `<home>/presets/<preset.name>.json`. `preset` has the preset's shape (§2.10); its `name` must be lowercase kebab case (`^[a-z0-9]+(-[a-z0-9]+)*$`), so that it is a file name inside `presets/` and `--preset` reads it as a name (`VALIDATION_FAILED`); and a `path:` source must be an absolute folder, since the caller knows what it was relative to (`VALIDATION_FAILED`). A file that exists fails `VALIDATION_FAILED` unless `replace` is `true`. A name equal to the running preset's fails `VALIDATION_FAILED`, with or without `replace`: the running preset is changed with the edit commands, which keep its backup. Nothing is installed, loaded, or trusted; the trust question comes when that preset starts.
6. **The `kvman` connector gains three commands**, each `asks: true`:
   - `preset-set { "key", "value" }` → `kvbuilder.app.preset.settings.set` → `kernel.preset.settings.set`;
   - `preset-reset { "key" }` → `kvbuilder.app.preset.settings.reset` → `kernel.preset.settings.reset`;
   - `preset-save { "file", "replace"? }` → `kvbuilder.app.preset.save` → `{ file, name }`: reads the preset file in the workspace, makes its `path:` entries absolute against that file's folder, and calls `kernel.presets.save`. The saved name is the file's own `name`, so the two can't disagree (the mockup's separate `name` is left out). A file that isn't there fails `NOT_FOUND`, and one that isn't a preset `VALIDATION_FAILED`.
7. **The section `installed`.** `kvbuilder.build.start` sets a second session section after `guide`: `kvcoder.section.set { id: 'installed', title: 'Installed in this app', order: 21, sessionId, content }`. A second `/build-kvman` renews it. Its text is English and has:
   - the first line `Preset: <name> (<origin>)`;
   - one block for each extension of `kernel.extensions.list`, by name: `- <name> (<namespace>), <source>, <version>`; then `  settings: <keys>` when it has settings; `  public commands: <names>` and `  public queries: <names>` when it has any; and `  pages: <topic> (<title>), …` for its docs pages (§9.5), or `  pages: none`;
   - a last line that says the list is as it was when `/build-kvman` ran, and that `kvman extensions-list` and `docs list` are current.
   An extension whose docs fail is listed with `pages: none`. A text over the section cap (16 KB, plan 08 §8.4) is cut at a whole extension block, and its last line then also says how many extensions were left out.
8. **The fourth built-in guide is `conventions`** (`@kvman/testkit`, `docs/conventions.md`; `extension: "kvman"`): naming, errors, jobs and what ends with them, handler points in place of events, storage, settings and their scopes, user-facing text, who owns UI, the docs pair, and tests. `docs list`, `docs get`, `kvman-docs`, and the scaffold's copy into a project's `docs/` have four guides.
9. **The guide (`docs/guide.md`) gains a part on presets and says to read first.** It says: the section "Installed in this app" is what runs here; read `conventions` before writing or changing an extension or a preset, and an extension's pages before building on it; "change this app" is an edit of the running preset (extensions with `extensions-install` and `extensions-uninstall`, values with `preset-set` and `preset-reset`, and `settings-set` for a setting the person may change later); "a different app" is a new preset, in the order `preset new`, edit with `fs`, `preset check`, `preview start` with it, `ask confirm`, `preset-save`, then tell the person the line `kvman --preset <name>`. The rule for a person who isn't a developer still holds: these words stay out of what is asked and said, except that start line.
10. **Undo.** The guide says how: `preset-reset`, or `preset-set` with the earlier value, for a value; for a saved preset, the file's path, which the person deletes.
11. **Nothing switches the running app to another preset**, and there is no command that lists or deletes the home's presets.
12. **The connector descriptions** of `kvman` and `preset` say the new commands' purpose, as each description says what its connector is for (ADR 0009, 170).
