# ADR 0006 — kvdev, the testkit, and the bundled presets

Status: accepted, 2026-09-29. Decided with the product owner in question rounds, after reviewing v2's builder (`archive/v2:plan/11-self-extension.md`).

1. **kvdev** extends kvcoder; it has no loop of its own. It adds connectors and sections (the SDK guide, the view-tree reference, connector authoring, and a summary of the workspace's projects). The `dev` preset loads kvai, kvwebui, kvcoder, and kvdev.
2. **Preview.** `preview start '{ "extensions": [folders], "preset"?: file }'` starts a second kvman as a child process:
   - its own temporary home, and port 3738 or the next free one;
   - `--yes`, and a generated preset (the dev extensions as `path:`, plus kvai and kvwebui, or the given preset with the dev extensions added).

   It prints the URL, which the chat shows as a link. `path:` hot reload applies edits live. `preview stop` ends it, and it also stops with the main kvman.
3. **Testkit.** A new package, `@kvman/testkit`: `createTestKernel({ extensions: [folders], settings?, secrets? })` runs a real kernel in-process with a temporary home and no HTTP.
   - It offers `exec` and `execAsync` as the user or as an extension, `waitForJob`, and a fake clock.
   - The scaffold's test uses it with `node:test`, and kvman's own tests use it too.
   - Walls: `testkit` may import `kernel` and `sdk`.
4. **Connectors.** Four connectors, each backed by a kernel command `kvdev.<connector>.<command>`:
   - `ext new { name, namespace, folder }` scaffolds a project: package.json with a `kvman` field and devDependencies `typescript`, `@kvman/sdk`, and `@kvman/testkit` pinned to kvman's version; `src/index.ts`; `locales/en.json` and `ar.json`; a passing `test/extension.test.ts`; tsconfig; README. Then it runs `npm install`.
   - `ext check { folder }` → `[{ file?, message, hint }]`.
   - `ext test { folder }` → the `npm test` results.
   - `preset new { name, file }` and `preset check { file }` (schema and references).
   - `preview start`, `preview stop`, `preview status`.
   - `docs get { topic }` → the SDK, views, or connectors guide.
5. **Toolchain.** `ext check` runs `npx tsc --noEmit` and the scaffold's `npm run check` (a script that loads the extension in a test kernel and reports invalid registrations, un-namespaced names, missing descriptions, and missing locale keys) as child processes in the project folder. `ext test` runs `npm test`. kvdev imports neither the kernel nor TypeScript. `ext new` needs the network once, for `npm install`.
6. **Bundled presets.** Both use bundled extensions only.
   - `coder`: kvai, kvwebui, and kvcoder, with `kvwebui.title` `kvcoder.app.title` ("kvman Coder") and `kvwebui.home` `kvcoder.chat`.
   - `dev`: kvai, kvwebui, kvcoder, and kvdev, with `kvwebui.title` `kvdev.app.title` ("kvman Dev"), `kvwebui.home` `kvcoder.chat`, and `kvcoder.bash.approval` `ask`.
