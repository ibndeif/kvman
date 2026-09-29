# 09 — kvdev (namespace `kvdev`)

kvdev is the harness for developing kvman extensions and presets. It has no loop of its own: it extends kvcoder (§8.4), registering its connectors with `kvcoder.connector.register` and its global sections with `kvcoder.section.set` from its `kernel.started` handler. The `dev` preset runs it. Projects live in the workspace folder, and the agent edits their files through its shell.

## 9.1 Connectors

| Call | Kernel command | Does |
|---|---|---|
| `ext new '{ "name", "namespace", "folder", "web"? }'` | `kvdev.ext.new` | scaffolds a project (below), then runs `npm install` in it |
| `ext list` | `kvdev.ext.list` | the projects in the workspace folder (folders whose package.json has a `kvman` field) → `[{ folder, name, namespace, version }]` |
| `ext check '{ "folder" }'` | `kvdev.ext.check` | runs `npx tsc --noEmit` and `npm run check` → `[{ file?, message, hint }]` |
| `ext test '{ "folder" }'` | `kvdev.ext.test` | runs `npm test` → its results |
| `preset new '{ "name", "file" }'` | `kvdev.preset.new` | writes a preset skeleton |
| `preset check '{ "file" }'` | `kvdev.preset.check` | validates the preset's schema and its references (extensions, settings, pages) |
| `preview start '{ "extensions": [folders], "preset"?: file }'` | `kvdev.preview.start` | starts a preview kvman (§9.3) → `{ url }` |
| `preview stop` / `preview status` | `kvdev.preview.stop` / `.status` | |
| `docs get '{ "topic": "sdk" \| "views" \| "components" \| "i18n" \| "connectors" \| "presets" }'` | `kvdev.docs.get` | a guide as Markdown |

## 9.2 The scaffold

`ext new` writes:
- `package.json`: `main` (`dist/index.js`), a `kvman` field (namespace, `source: "src/index.ts"`, dependencies), `@kvman/sdk` as a peerDependency, and devDependencies `typescript`, `@kvman/sdk`, and `@kvman/testkit`, pinned to the versions that the running kvman bundles, plus the scripts `build` (for publishing), `check`, and `test`;
- `src/index.ts`, in erasable TypeScript, which a `path:` extension loads directly (§2.9), so edits need no build step;
- `locales/en.json` and `locales/ar.json`;
- `test/extension.test.ts`, a passing `node:test` test that uses `createTestKernel`;
- `tsconfig.json` and `README.md`.

With `web: true`, it also writes:
- `web/components/Hello.vue`, a sample component styled with kvwebui's CSS variables and typed with `@kvman/sdk/web`;
- a Vite library build (`vue` external) into `dist/web/components/<name>.js` and `.css`, the `kvman.web: "dist/web"` field, and the scripts `web:build` and `web:watch`;
- a `<namespace>.ui.get` with a sample page that shows the component;
- devDependencies `vite`, `@vitejs/plugin-vue`, and `vue`, pinned to the versions kvwebui uses.

The toolchain comes from the project, so kvdev imports neither the kernel nor TypeScript. `npm run check` loads the extension in a test kernel and reports:
- invalid registrations;
- names outside the namespace;
- missing descriptions;
- missing locale keys;
- warnings for `setInterval` and unawaited `setTimeout` in handlers (§2.2).

## 9.3 Preview

`preview start` runs a second kvman through the kernel's process service (`ctx.processes`, §2.16), with the running kvman's Node and entry file (`process.execPath`, `process.argv[1]`):
- its own temporary home, so it never touches real data;
- port 3738, or the next free one;
- `--yes` and `--no-open`;
- a generated preset: the dev extensions as `path:`, plus kvai and kvwebui (or the given preset, with the dev extensions added).

For each project with a `web:watch` script, it also runs that script through `ctx.processes`, so component edits rebuild; a page refresh then shows them (§6.4).

It returns the URL, which kvcoder's conversation shows as a link. `path:` hot reload applies edits live. `preview stop` ends it, and it also stops with the main kvman.

## 9.4 Sections

kvdev adds one global section to kvcoder's prompt (§8.4): a short guide to extensions, connectors, and presets, pointing to `docs get` for details and to `ext list` for the workspace's projects.
