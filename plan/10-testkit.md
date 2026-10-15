# 10 — Testkit (`@kvman/testkit`)

The testkit runs a real kernel in-process for tests, with a temporary home and no HTTP. kvman's own tests and extension projects both use it.

```ts
const kernel = await createTestKernel({ extensions: ['./'], settings?: { … }, secrets?: { … } });
await kernel.exec('notes.add', { text: 'hi' });                              // as the user
await kernel.exec('notes.add', { text: 'hi' }, { as: '@acme/notes' });       // as an extension
await kernel.exec('notes.add', { text: 'hi' }, { workspaceId: ws.id });      // in a workspace (default Home)
const jobId = await kernel.execAsync('notes.reindex', {});
const job = await kernel.waitForJob(jobId);
await kernel.clock.advance(60_000);                                          // fake clock: the kernel's timers
await kernel.restart();                                                      // stop as Ctrl+C does, start again on the same home
await kernel.close();
```

- Workers, validation, storage, and every other kernel behavior are real.
- **Installed dependencies** (ADR 0080, 4). Every `kvman.dependencies` entry of a loaded extension that `extensions` doesn't name, and the entries of those in turn, is loaded from the first `node_modules/<name>` folder at or above the folder of the extension that declares it, by its `main`, as a bundled extension loads. A project installs each one as an exact devDependency. One that isn't found is left out, so the kernel fails `EXTENSION_INVALID` naming it.
- `settings` and `secrets` are set before the extensions load. `settings` are the run's preset settings, and `secrets` is `{ "<extension package>": { "<name>": "<value>" } }` (ADR 0009, 13).
- A test kernel starts one worker unless `settings` set `kernel.workers` (ADR 0009, 10).
- Its Home workspace is a temporary folder of its own, and `close()` removes it with the temporary home (ADR 0009, 11).
- The fake clock drives the kernel's own timers: retries, schedules, retention, and ids. It doesn't change `Date` inside handlers. `await kernel.clock.advance(ms)` resolves once no job is running or due (ADR 0009, 15).
- `restart()` stops the test kernel as Ctrl+C does, then starts it again on the same home, Home folder, extensions, and settings; the fake clock carries over, and `restart({ stoppedForMs })` moves it while the kernel is stopped (ADR 0009, 16).
- `exec` and `execAsync` take `{ as?, workspaceId?, onProgress? }`. `onProgress(chunk)` receives the progress chunks (`{ source, data }`) of that call's root job (ADR 0009, 61).
- `kernel.watch(jobId, onProgress)` → `stop` receives any job's progress chunks from then on, as its HTTP stream does (ADR 0009, 108).
- `@kvman/testkit/fake-openai` is the fake OpenAI-compatible streaming server of §7.4: `startFakeOpenAI()` → `{ baseUrl, reply(script), requests(), close() }` (ADR 0009, 62).
- **Bins** build and check extensions for any harness or none (ADR 0010, 2). `kvman-new` writes the scaffold (with a `.gitignore` of `node_modules/` and `dist/`) and copies the four kernel-level guides into the project's `docs/` (§9.2), then, before `npm install`, runs `git init` when `git` is on the PATH and the folder isn't inside a work tree, making no commit (ADR 0082, 16); the scaffold's `ui.get` handler is typed by its `z.json()` output schema, so the project type-checks as written (ADR 0082, 2); `kvman-docs list|get` prints the guides and the docs of the extensions a running kvman has loaded (§9.5); `kvman-preset new|check` writes and validates a preset (§9.1); `kvman-preview` runs the preview with `--preset <file>` and `--kvman <entry>` options (§9.3). Their arguments are the fields of the matching kvbuilder connector as flags (`--name`, `--namespace`, `--web`), the folder or file as an argument, and `--json` prints its output. **Conventions** (ADR 0010, 19–21): exit 0 on success and 1 on failure; with `--json` a failure is one JSON object `{ code, message, params? }` on stderr, without it the line `error: <message>`; the codes are `VALIDATION_FAILED`, `NOT_FOUND`, `NOT_RUNNING`, `FOLDER_NOT_EMPTY`, `FILE_EXISTS`, `NPM_FAILED`, `GIT_FAILED`, `NO_FREE_PORT`, and `PREVIEW_FAILED`. `kvman-docs` and `kvman-preset check` find the running kvman through `<home>/kvman.lock` (`--home`, `KVMAN_HOME`, or `~/.kvman`) or a `127.0.0.1` `--url`; with none running, `kvman-preset check` checks the schema and the `path:` folders only. `kvman-preview` prints its URL as one line when ready (`{ "url" }` with `--json`), keeps running until SIGINT or SIGTERM, and takes `--name <name>` (default `preview`). The kernel-level guides (`conventions`, `sdk`, `i18n`, `presets`; ADR 0030, 8) are the testkit's `docs/` folder; the scaffold's pinned versions and the names of the bundled extensions, which the preview adds when a project depends on them (§9.3, ADR 0080, 5), are testkit constants.
- **`kvman-check`** is the scaffold's `check` script (§9.2): run in a project, it loads the extension in a test kernel and prints its findings, or with `--json` the `[{ file?, message, hint }]` array; it exits 1 on an error and 0 with only warnings (ADR 0009, 116). A declared dependency that isn't installed is one error finding for each, naming the dependency and the line `npm install --save-dev --save-exact <name>@<version>` (ADR 0080, 4).
- It may import `kernel` and `sdk` (§1.4). It is published as `@kvman/testkit` and depends on `@kvman/kernel`.
