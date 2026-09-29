# 09 — kvdev (namespace `kvdev`)

kvdev is the harness for developing kvman extensions and presets. It has no loop of its own: it extends kvcoder (§8.4) with connectors and sections, and the `dev` preset runs it. Projects live in the workspace folder, and the agent edits their files with bash.

## 9.1 Connectors

| Call | Kernel command | Does |
|---|---|---|
| `ext new '{ "name", "namespace", "folder" }'` | `kvdev.ext.new` | scaffolds a project (below), then runs `npm install` in it |
| `ext check '{ "folder" }'` | `kvdev.ext.check` | runs `npx tsc --noEmit` and `npm run check` → `[{ file?, message, hint }]` |
| `ext test '{ "folder" }'` | `kvdev.ext.test` | runs `npm test` → its results |
| `preset new '{ "name", "file" }'` | `kvdev.preset.new` | writes a preset skeleton |
| `preset check '{ "file" }'` | `kvdev.preset.check` | validates the preset's schema and its references (extensions, settings, pages) |
| `preview start '{ "extensions": [folders], "preset"?: file }'` | `kvdev.preview.start` | starts a preview kvman (§9.3) → `{ url }` |
| `preview stop` / `preview status` | `kvdev.preview.stop` / `.status` | |
| `docs get '{ "topic": "sdk" \| "views" \| "connectors" \| "registries" \| "presets" }'` | `kvdev.docs.get` | a guide as Markdown |

## 9.2 The scaffold

`ext new` writes:
- `package.json`: `main`, a `kvman` field (namespace, dependencies), and devDependencies `typescript`, `@kvman/sdk`, and `@kvman/testkit`, pinned to kvman's version, plus the scripts `build`, `check`, and `test`;
- `src/index.ts`;
- `locales/en.json` and `locales/ar.json`;
- `test/extension.test.ts`, a passing `node:test` test that uses `createTestKernel`;
- `tsconfig.json` and `README.md`.

The toolchain comes from the project, so kvdev imports neither the kernel nor TypeScript. `npm run check` loads the extension in a test kernel and reports:
- invalid registrations;
- names outside the namespace;
- missing descriptions;
- missing locale keys;
- warnings for `setInterval` and unawaited `setTimeout` in handlers (§2.2).

## 9.3 Preview

`preview start` runs a second kvman through the kernel's process service (`ctx.processes`, §2.16):
- its own temporary home, so it never touches real data;
- port 3738, or the next free one;
- `--yes`;
- a generated preset: the dev extensions as `path:`, plus kvai and kvwebui (or the given preset, with the dev extensions added).

It returns the URL, which the chat shows as a link. `path:` hot reload applies edits live. `preview stop` ends it, and it also stops with the main kvman.

## 9.4 Sections

kvdev adds these sections to kvcoder's prompt:
- a short guide to extensions, connectors, and presets, pointing to `docs get` for details;
- a summary of the projects in the workspace (folders whose package.json has a `kvman` field).
