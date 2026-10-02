# 09 — kvdev (namespace `kvdev`)

kvdev is the harness for developing kvman extensions and presets. It has no loop of its own: it extends kvcoder (§8.4), registering its connectors with `kvcoder.connector.register` and its global sections with `kvcoder.section.set` from its `kernel.started` handler. The `dev` preset runs it. Projects live in the workspace folder, and the agent edits their files through its shell.

## 9.1 Connectors

| Call | Kernel command | Does |
|---|---|---|
| `ext new '{ "name", "namespace", "folder", "web"? }'` | `kvdev.ext.new` | scaffolds a project (below), then runs `npm install` in it → `{ folder, name, namespace, web }` |
| `ext list` | `kvdev.ext.list` | the projects in the workspace folder (folders whose package.json has a `kvman` field) → `[{ folder, name, namespace, version }]`, sorted by folder |
| `ext check '{ "folder" }'` | `kvdev.ext.check` | runs `npx tsc --noEmit --pretty false`, then `npm run check -- --json` → `[{ file?, message, hint }]`, TypeScript's findings first |
| `ext test '{ "folder" }'` | `kvdev.ext.test` | runs `npm test` → `{ passed, exitCode, output }` (the last 30 KB of the output) |
| `preset new '{ "name", "file" }'` | `kvdev.preset.new` | writes a preset skeleton → `{ file }` |
| `preset check '{ "file" }'` | `kvdev.preset.check` | validates the preset's schema and its references (extensions, settings, pages) → `[{ file, message, hint }]` |
| `preview start '{ "extensions": [folders], "preset"?: file }'` | `kvdev.preview.start` | starts a preview kvman (§9.3) → `{ url }` |
| `preview stop` / `preview status` | `kvdev.preview.stop` / `.status` | `{}` / `{ running: false }` or `{ running: true, url, extensions, startedAt }` |
| `docs get '{ "topic": "sdk" \| "views" \| "components" \| "i18n" \| "connectors" \| "presets" }'` | `kvdev.docs.get` | a guide as Markdown |

- **Descriptions.** Each connector's `description` says what it is for and when to use it (ADR 0009, 170): `ext` for any work on an extension, running `check`, then `test`, after changing one; `preset` to create a preset file and check it before running it; `preview` to show the person a project working, stopping it when done; `docs` before writing an extension, preset, view, or component.
- **Folders.** Every `folder` and `file` resolves against the workspace folder and must stay inside it (`VALIDATION_FAILED`). `ext check` and `ext test` of a folder whose package.json has no `kvman` field fail `kvdev/NOT_A_PROJECT` (ADR 0009, 121, 126).
- **`ext new`.** `name` is an npm package name (lowercase, with an optional `@scope/`), and `namespace` follows the kernel's namespace rule. The folder must not exist or must be empty (`kvdev/FOLDER_NOT_EMPTY`). A failed `npm install` fails `kvdev/NPM_FAILED` with the last lines of its output and keeps the written files; `npm` or `npx` missing from the PATH fails `kvdev/NPM_FAILED` too (ADR 0009, 121, 126).
- **`ext list`** walks the workspace folder, itself included (`.`), skipping `node_modules` and dot-folders, and doesn't look inside a project it found (ADR 0009, 126).
- **`preset new`** writes `{ "name": <name>, "extensions": { "@kvman/kvai": "bundled", "@kvman/kvwebui": "bundled" }, "settings": { "kvwebui.home": "kvwebui.extensions" } }`, which runs as-is; an existing file fails `kvdev/FILE_EXISTS` (ADR 0009, 123).
- **`preset check`** (ADR 0009, 122):
  - extensions: a `bundled` name must be a bundled extension (all four are loaded while kvdev runs); a `path:` folder, relative to the preset file, must hold a package.json with a `kvman` field; an `npm:` source is checked for its format only;
  - settings: a key's namespace must be `kernel` or one of the preset's extensions'; a loaded extension's key must be registered, and its value must match its schema (zod's `z.fromJSONSchema`);
  - pages: `kvwebui.home` must be a built-in page, a page from a loaded extension's `ui.get`, or a page under an unloaded extension's namespace.
- **Jobs.** The connector commands are public. Timeouts: `kvdev.ext.new` 10 minutes, `kvdev.ext.check` 5, `kvdev.ext.test` 10, and `kvdev.preview.start` 5; every kvdev command has `retries: 0` (ADR 0009, 126).
- **Errors.** `kvdev/FOLDER_NOT_EMPTY`, `kvdev/FILE_EXISTS`, `kvdev/NOT_A_PROJECT`, `kvdev/NPM_FAILED`, `kvdev/NO_FREE_PORT`, and `kvdev/PREVIEW_FAILED` (ADR 0009, 126).

## 9.2 The scaffold

`ext new` writes:
- `package.json`: `main` (`dist/index.js`), a `kvman` field (namespace, `source: "src/index.ts"`, dependencies: `{}`, plain or web, ADR 0009, 128), `@kvman/sdk` as a peerDependency, and devDependencies `typescript`, `@types/node` (ADR 0009, 127), `@kvman/sdk`, and `@kvman/testkit`, pinned to the versions that the running kvman bundles, plus the scripts `build` (for publishing), `check`, and `test`;
- `src/index.ts`, in erasable TypeScript, which a `path:` extension loads directly (§2.9), so edits need no build step. It registers a public query `<namespace>.greeting.get` (a sentence) and a `<namespace>.ui.get` with a page `hello` and a nav item that shows the greeting (ADR 0009, 118);
- `locales/en.json` and `locales/ar.json`;
- `test/extension.test.ts`, a passing `node:test` test that uses `createTestKernel`;
- `tsconfig.json` and `README.md`.

With `web: true`, it also writes:
- `web/components/Hello.vue`, a sample component styled with kvwebui's CSS variables and typed with `@kvman/sdk/web`, shown on the `hello` page;
- a Vite library build (`vue` external), one build per component, into `dist/web/components/<name>.js` and `.css`, the `kvman.web: "dist/web"` field, and the scripts `web:build` and `web:watch`;
- devDependencies `vite`, `@vitejs/plugin-vue`, and `vue`, pinned to the versions kvwebui uses.

The versions the scaffold pins are a kvdev constant, which a test checks against the monorepo (ADR 0009, 126).

The toolchain comes from the project, so kvdev imports neither the kernel nor TypeScript. The scaffold's `check` script is `kvman-check`, a bin of `@kvman/testkit` (§10). It loads the extension in a test kernel and prints readable findings, or with `--json` the `[{ file?, message, hint }]` array; it exits 1 on an error and 0 with only warnings (ADR 0009, 116). It reports:
- the failed load, when the kernel refuses the extension: invalid registrations, names outside the namespace, missing descriptions, bad catalogs (one at a time, since a load stops at its first error);
- each top-level input field of a public command or query with no description;
- missing locale keys: a key in one shipped catalog but not another, every key the `<namespace>.ui.get` answer uses, `<namespace>.title`, and each setting's `<key>.title`;
- warnings from a text scan of `src/**/*.ts`, skipping comments: every `setInterval(`, and every `setTimeout(` whose statement doesn't start with `await` (§2.2).

A TypeScript error is `{ file: "src/index.ts:12:5", message: "TS2322: …", hint }`, with paths relative to the project (ADR 0009, 117).

## 9.3 Preview

`preview start` runs a second kvman through the kernel's process service (`ctx.processes`, §2.16), with the running kvman's Node, its flags, and its entry file (`process.execPath`, `process.execArgv`, `process.argv[1]`, which every worker sees as the main thread does, §2.2), in the workspace folder (ADR 0009, 114, 126):
- its own temporary home, `<os temp>/kvman-preview-<workspaceId>`, so it never touches real data: emptied at each start, and removed by `preview stop` and when the preview exits by itself (ADR 0009, 125);
- port 3738, or the next free one up to 3837 (`kvdev/NO_FREE_PORT`);
- `--yes` and `--no-open`;
- a generated preset: the dev extensions as `path:`, plus kvai and kvwebui, with `kvwebui.home` set to `kvwebui.extensions` (or the given preset, with its `path:` entries made absolute and the dev extensions added, replacing entries of the same name; it keeps its own home) (ADR 0009, 119, 126).

For each project with a `web:watch` script, it first runs `npm run web:build` once, then runs `web:watch` through `ctx.processes` (as `web-<n>`; the preview is `preview`), so component edits rebuild; a page refresh then shows them (§6.4).

It returns `{ url }` once the preview answers `kernel.health.get`; after 30 s, or when the preview exits first, it stops what it started and fails `kvdev/PREVIEW_FAILED` with the last log lines (ADR 0009, 124). kvcoder's result card shows the URL as a link (§8.7, ADR 0009, 120). `path:` hot reload applies edits live. A second `preview start` fails `PROCESS_RUNNING`. `preview stop` ends the preview and its `web:watch` processes (`NOT_FOUND` when none runs), and they also stop with the main kvman. kvdev's `kernel.process.exited` handler stops the `web:watch` processes and removes the home when the preview exits by itself.

## 9.4 Sections

kvdev adds one global section to kvcoder's prompt (§8.4), `guide` with order 20, set at each kvdev start: a short guide to extensions, connectors, and presets, pointing to `docs get` for details and to `ext list` for the workspace's projects. It says to use the `ext`, `preset`, `preview`, and `docs` connectors for everything they cover and the shell for the rest, and to edit a project's files with `fs` (ADR 0009, 170). The guides and the section are English, as text for a model is (§2.11, ADR 0009, 126).
