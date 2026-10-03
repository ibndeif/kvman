# ADR 0010 — kvcustomizer: extension development for any harness, and managing kvman

Status: accepted, 2026-10-03. It supersedes ADR 0006 where they differ and changes ADR 0009, 45.

Asked: "Do we really need a kvdev to allow user to develop extensions?" and then: "The user should be able to build extensions here, or using any other harness like pi, Claude Code, or manually by handwriting." The product owner then asked for kvdev to be renamed, the `dev` preset removed, and for the extension to manage kvman itself.

## Decisions

1. **Developing an extension needs no harness.** A person can scaffold, read the guides, check, test, and preview an extension with kvcoder, Claude Code, pi, or by hand. Before this, the scaffold and the guides were reachable only through kvdev's connectors.
2. **The tooling is `@kvman/testkit` bins.** Next to `kvman-check` come `kvman-new` (scaffold), `kvman-preset new|check`, and `kvman-preview`. Chosen over subcommands on the `kvman` CLI, a separate `create-kvman-extension` package, and docs only. The guides are the testkit's `docs/` folder, and `kvman-new` copies them into the project's `docs/` folder (chosen over shipping them in `@kvman/sdk` and over keeping them in the extension). Each bin takes its connector's fields as flags and prints the connector's output with `--json` (plan 09 §9.2, plan 10).
3. **The extension reaches the bins through its own dependency.** It declares `@kvman/testkit` in its package.json, resolves the bins and `docs/` from its own node_modules, and runs a bin as a child process with the running Node. It never imports the testkit, so the import walls hold. Chosen over `npx` at call time (network, version drift). `docs get` reads the testkit's `docs/`, since it works before a project exists.
4. **kvdev becomes kvcustomizer.** Package `@kvman/kvcustomizer`, namespace `kvcustomizer`, shown as "kvman Customizer". It still extends kvcoder with connectors (`ext`, `preset`, `preview`, `docs`) and the `guide` section, and its error codes are `kvcustomizer/…`. The `dev` preset and `kvdev.app.title` are removed, and `coder` loads kvai, kvwebui, kvcoder, and kvcustomizer, so the default app can customize kvman. A person's preset in `<home>/presets/` that has the name of a bundled preset now **replaces** it (it failed `VALIDATION_FAILED`: ADR 0009, 45), so editing the running preset persists with a bare `kvman`. The cost is that such a copy no longer receives changes to the bundled preset.
5. **Managing kvman is the kernel's, with a manageable Extensions page.** A person lists, installs, configures, and uninstalls extensions from kvwebui's Extensions page, and the change reflects in the current preset. kvwebui can't call a customizer that may not be loaded, so the kernel gains three public commands (plan 02 §2.10, §2.12):
   - `kernel.preset.get` (query): the preset as stored now, with its `origin` (`bundled`, `home`, or `file`) and the `file` an edit writes.
   - `kernel.extensions.install { name, source }` and `kernel.extensions.uninstall { name }` (commands): each writes the preset file (copying the bundled preset to `<home>/presets/<name>.json` first) and returns `{ file, restartRequired: true }`.
   - **A change applies at the next start.** Nothing is installed, loaded, or trusted by the edit: `npm install` and the terminal trust question happen at the next start, as before. This adds no new kernel machinery and keeps the trust rule. Chosen over live-apply commands and over settings only.
   - Configuring stays `kernel.settings.set`, which is live. Failures use existing codes (`VALIDATION_FAILED`, `NOT_FOUND`); no new kernel code.
   - kvwebui's page shows what the stored preset changes against the loaded extensions ("Starts after restart", "Removed after restart") and a "Restart kvman to apply" banner (plan 06).
6. **kvcustomizer also lets the agent manage kvman**: change the model, install and uninstall extensions, and edit the preset, through connectors that call these kernel commands and `kernel.settings.set`. Secrets are never touched (`CLAUDE.md` §6).

7. **`kvman-preview` runs the `kvman` on the PATH**, with an optional `--kvman <entry>` to run another. Through kvcustomizer the connector passes the running kvman's entry, so the preview matches the app that started it. Chosen over always requiring `--kvman` and over depending on the `kvman` package.
8. **One `kvman` connector manages the app; `ext` stays for projects.** Calls: `model list|set`, `settings list|set|reset`, `extensions list|install|uninstall`, `preset get`. Each is a public kvcustomizer command named `kvcustomizer.app.<noun>.<verb>` that wraps a kernel command, and none touches secrets. Chosen over one connector per noun (renaming `ext` to `project`) and over folding the calls into `ext` and `preset`.
9. **`kvman-new` writes `AGENTS.md` and a one-line `CLAUDE.md` that points to it.** `AGENTS.md` says the folder is a kvman extension, to read `docs/` first, to run `npm run check` and `npm test` after each change, and not to edit `dist/`. Both are English and short, and the person may delete them.
10. **Confirmed details.** `kernel.extensions.install` accepts `source: "bundled"` only for a bundled extension's name; the bins' flags are `--name`, `--namespace`, `--web`, and `--json`; `kernel.preset.get` returns the preset as stored now, not as loaded.

11. **The documentation is plain Markdown in the repository**, in `docs/developers/` and `docs/user-guide/`, with no documentation site generator and no new dependency. The pages are listed in `milestones/QA17-DOCS.md`. The testkit's six guides stay short and written for a model; the developer documentation is the full text for people.
12. **A preset write that can't be made fails `VALIDATION_FAILED`**, as `kernel.folder.create` does for a folder that can't be written (ADR 0009, 222).
13. **Preset edits are serialized in the kernel**, so two edits at once both land, and each file is written whole or not at all.
14. **A bin that fails without a structured error fails `HANDLER_FAILED`** in kvcustomizer's connector, which logs its output and never sends it. A bin that fails with `{ code, message, params }` on stderr becomes the matching `kvcustomizer/…` Problem.

## Consequences for the code (not done yet)

- Rename `extensions/kvdev` to `extensions/kvcustomizer`: package, namespace, command names, error codes, catalogs, docs, tests, changeset.
- Move the scaffold templates, the pinned-version constant and its test, the six guides, `preset new|check`, and the preview launcher into `packages/testkit`, with bins and tests, and the in-test registry for the scaffold.
- Delete `presets/dev.json`; `presets/coder.json` loads kvcustomizer. `coder` keeps its own `kvcoder.shell.approval` default, unlike `dev`, which set `ask`.
- Kernel and kvwebui: the three commands, the preset-name rule, and the page changes.
- Changes to `@kvman/sdk` types (the new commands' shapes) need a changeset.
