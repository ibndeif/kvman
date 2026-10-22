# 13 — Milestones

Do them strictly in order. Each one follows `CLAUDE.md` §2:
1. Read its sections.
2. Ask about any gap.
3. Write `milestones/<id>-TEST-CASES.md`.
4. Build exactly its Build list.
5. Write one test per scenario.
6. Pass `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check`.
7. Add a README row, then commit.

`bench:check` passes with no benchmarks until M1.3 adds the first one. There is no CI in this phase: the gates run locally, on the developer's OS (§12.1).

## M1 — Kernel

### M1.1 Monorepo

- **Read:** `01` §1.4; `12` §12.1; `CLAUDE.md`.
- **Build:**
  - The pnpm workspace (Node 24) and TypeScript strict, with the `CLAUDE.md` §5 flags.
  - ESLint with the import walls of §1.4 (including the exported-subpath rule), `max-lines` 300, and no `any`.
  - Vitest, and the gate scripts `typecheck`, `lint`, `test`, `build`, `bench:check` (the benchmark runner, with no benchmarks yet).
  - Changesets for `sdk`, `testkit`, and `extensions/*`.
  - Empty `packages/sdk`, `kernel`, `cli`, and `testkit`, with their published names (`@kvman/sdk`, `@kvman/kernel`, `kvman`, `@kvman/testkit`).
  - `.gitignore` and the README skeleton.
- **Done when:**
  - All gates run green on the empty packages.
  - A file that breaks a wall, or that has 301 lines, fails `pnpm lint`.

### M1.2 SDK

- **Read:** `03`; `05`; `02` §2.9–§2.10; `04` §4.1.
- **Build:** `@kvman/sdk`:
  - the `Ctx` types (§3.1–§3.5), including `scopes` on settings, `key` on schedules, `order` and `count` on collections, and `ctx.log`, plus `z`;
  - the zod schemas and types for the extension manifest (`kvman` field, with `source`), preset, Problem (with the kernel codes, including `INTERRUPTED`), job row, workspace, file row, and the HTTP envelope;
  - the empty `Commands` and `Queries` maps with typed `exec`;
  - one-line TSDoc on every export.
- **Done when:**
  - Valid and invalid manifests, presets, and envelopes parse or fail with the right issues.
  - A declared `Commands` entry gives typed input and output to `ctx.exec`, and an undeclared name takes and returns `unknown` (a type test).

### M1.3 Storage

- **Read:** `02` §2.5, §2.7, §2.8, §2.13; `01` §1.3.
- **Build:**
  - Opening `kvman.db` (WAL, busy timeout), and the kernel tables for stores, settings, files, jobs, schedules, workspaces, and accepted extensions.
  - The store API: `kv`; collections with `insert`, `get`, `find` (equality, `limit` ≤ 1000, `order` by id), `count`, `update` (shallow merge), and `delete` (`NOT_FOUND` for a missing id); the 16 MiB document cap; synchronous `transaction(tx => …)` with `tx.global`; the workspace and `global` scopes.
  - Settings resolution (workspace → global → preset → default), declared scopes (including preset-only `[]`), and skipping a stored value that fails its schema.
  - `secrets.json` (atomic replace; mode 0600 on Linux and macOS).
  - Files (`files/<id>`, rows, the 1 GiB cap).
  - UUIDv7 ids with an injected clock and random source.
  - The collection `find` benchmark.
- **Done when:**
  - Writes from two worker threads through their own connections are both visible.
  - An async `transaction` callback rolls back with `VALIDATION_FAILED`.
  - `find` without a limit, or with more than 1000, fails; `order: 'desc'` returns the newest first, and `count` matches.
  - A document over 16 MiB fails `TOO_LARGE`.
  - Settings resolve in order; a global-only key refuses the workspace scope; a stored value that no longer fits is skipped with a warning.
  - A secret never appears in SQLite or in logs.
  - A file over 1 GiB fails `TOO_LARGE`.
  - The benchmark meets its target.

### M1.4 Extensions and workers

- **Read:** `02` §2.1, §2.2, §2.8 (preset checks), §2.9 (bundled and path sources, the SDK, TypeScript entries, loading, access), §2.13; `03`; `10`.
- **Build:**
  - Reading the `kvman` manifest; `bundled` and `path:` sources, with `kvman.source` loaded through type stripping; dependency order; `semver` ranges; the `EXTENSION_INVALID` checks, including the sdk peer range.
  - The resolve hook that gives every extension the kernel's `@kvman/sdk`.
  - The worker pool (`kernel.workers`, `kernel.workerConcurrency`), with each worker loading every extension.
  - `AsyncLocalStorage` for the current job, including `ctx.job` (`id`, `rootId`, `workspace`, `caller`, `signal`, `progress`).
  - Sync `ctx.exec` on the calling worker, with input and output validation, `public` access (`NOT_PUBLIC`), read-only queries (`READ_ONLY`), depth 16 (`TOO_DEEP`), and per-registration size caps (`TOO_LARGE`).
  - `HANDLER_FAILED` for unknown errors, `WORKER_CRASHED` with replacement, and timeouts (`TIMEOUT`).
  - Checking the preset's settings after load.
  - `ctx.log`.
  - `@kvman/testkit` `createTestKernel` (§10), with `as` and `workspaceId`.
  - The `ctx.exec` benchmark.
- **Done when:**
  - Every loading rule, including a dependency cycle and an sdk range the kernel doesn't satisfy, stops the kernel with `EXTENSION_INVALID` and the offending extension (or the cycle) named.
  - Two extensions get the same `@kvman/sdk` instance, and a `path:` extension loads from its `.ts` source.
  - A preset setting with an unknown key or an invalid value, or a required key the preset doesn't set, fails `VALIDATION_FAILED`.
  - A handler sees its own workspace and caller while 32 jobs interleave on one worker, and nested sync calls on a full worker still complete.
  - Each access rule, limit, and depth rule fails with its code.
  - A crashed worker's jobs fail `WORKER_CRASHED` and a new worker takes over.
  - `ctx.log` lines carry the extension and job id.
  - The benchmark meets its target.

### M1.5 Async jobs and schedules

- **Read:** `02` §2.1 (rows, retention), §2.3, §2.4, §2.14 (stop), §2.15; `12` §12.2.
- **Build:**
  - `execAsync` job rows with first-in, first-out start, retries with backoff, `ctx.problem` without retry, and cancel (`ctx.cancel`), which ends a job when its handler settles, with shared signals for nested sync jobs.
  - `INTERRUPTED` attempts, retried like other failures.
  - Retention.
  - Resuming queued jobs at start.
  - `ctx.schedule` (`at`, `cron` with croner, `key`), `schedule.cancel`, the one-time delete, and a missed run once at start.
  - Nested progress to the root job.
  - Handler points (§2.15): `ctx.registerHandler`, delivery in the job's final transaction, loop safety, and `kernel.started` and `kernel.stopping`.
  - The shutdown sequence (`kernel.stopping`, abort, 10 s, workers stop, unfinished attempts `INTERRUPTED`).
  - `kernel.started` handlers in dependency order before the kernel reports ready (10 s budget; unfinished ones keep running).
  - Resuming tested by closing and reopening a test kernel on the same home. The SIGKILL crash tests come in M1.8, once the bin exists.
  - The `execAsync` benchmark.
- **Done when:**
  - A failing job retries three times with 1, 2, and 4 s backoff (fake clock), then ends `failed`.
  - A cancelled job ends `cancelled` once its handler returns, and its nested sync job sees the abort.
  - A cron schedule runs at each due time, and a missed one runs once. Scheduling twice with the same key leaves one schedule.
  - A failed sync job and a failed async job each queue one `kernel.job.failed` handler job. A handler that fails, runs a failing nested job, or queues an async job or schedule that fails, triggers no handlers. `kernel.started` runs once per start.
  - Closing a test kernel mid-job fails the attempt with `INTERRUPTED`. On reopening, a job with retries left runs again, a job with `retries: 0` has ended `failed`, and a finished job never reruns.
  - The benchmark meets its target.

### M1.6 Workspaces, kernel API, localization, hot reload

- **Read:** `02` §2.6, §2.8, §2.11, §2.12, §2.9 (hot reload), §2.16.
- **Build:**
  - Home (`home`), and `kernel.workspace.*`: remembered workspaces, closing as a pause (queued jobs and schedules wait; calls fail `NOT_FOUND`), and reopening by path.
  - The rest of `kernel.*` (settings with scopes, secrets with `set` sync only, jobs, files, extensions, and health, with JSON Schemas).
  - `ctx.settings.set` (own keys only, declared scopes), and `ctx.files` (`read`, `path`, and access rules).
  - Locale catalogs merged per language (any `locales/<lang>.json`), with the `en`-then-key fallback, the open `kernel.language`, and `languages` in `kernel.health.get`.
  - The `kernel.workspace.opened` point (first open only; Home on a new home).
  - The `revision` of each extension in `kernel.extensions.list`.
  - `path:` hot reload: a recursive watch, fresh workers with the new code while the old ones drain, and the old code kept on failure.
  - Rerunning the `kernel.started` handlers of a hot-reloaded extension and of its dependents, in dependency order.
  - The process service (§2.16), with process groups on Linux and macOS and `taskkill /T /F` on Windows, `kernel.processes.list`, and the `kernel.process.exited` point.
- **Done when:**
  - Every `kernel.*` command and query behaves as §2.12 says, including opening an open folder, reopening a closed one with its data, and closing Home.
  - A closed workspace's queued job and due schedule wait, and run after it's reopened.
  - `kernel.secrets.list` never returns a value, and `kernel.secrets.set` with `async` fails `VALIDATION_FAILED`.
  - An edited `path:` extension serves new registrations while a running job finishes on the old code, and a broken edit keeps the old code.
  - A reload of an extension reruns its dependents' `kernel.started` handlers, and raises its `revision`.
  - Opening a new path triggers `kernel.workspace.opened` once; reopening it doesn't.
  - An extension's `fr` catalog makes `fr` selectable, and a key missing in `fr` falls back to `en`, then to the key.
  - A started process logs its output, survives a hot reload, triggers `kernel.process.exited` when it exits, and a second start of the same name fails `PROCESS_RUNNING`.

### M1.7 HTTP

- **Read:** `04`; `02` §2.9 (web files).
- **Build:**
  - Hono on 127.0.0.1, with Host and Origin checks (`FORBIDDEN_ORIGIN`).
  - The envelope routes for commands (sync and async) and queries, with the `jobId`, route mismatches (`NOT_FOUND`), body caps (`TOO_LARGE`), and cancel on client disconnect.
  - Jobs: get, cancel, and the SSE stream (`progress`, `result`, `problem`).
  - File upload (raw body) and download.
  - Locales.
  - Static `kvman.web` folders, and `/` with the `index.html` fallback.
  - The HTTP benchmark.
  - Unit tests of the pure parts; the route scenarios are written now and tested in M1.8, through the CLI (ADR 0009, 35).
- **Done when:**
  - Every route answers as §4 says.
  - A foreign Host or Origin gets `FORBIDDEN_ORIGIN`.
  - The stream delivers a nested job's progress, then the result.
  - A finished job's stream answers at once.
  - A sync call whose client disconnects ends `cancelled`.
  - A path outside a web folder gets 404.
  - The benchmark meets its target.

### M1.8 CLI

- **Read:** `01` §1.2–§1.3; `02` §2.9 (npm, trust), §2.10, §2.14; `12` §12.2.
- **Build:** the `kvman` bin:
  - flags (`--mode`, `--preset`, `--home`, `--port`, `--yes`, `--no-open`, `--log-level`), `--help`, and `--version`;
  - `kvman.lock` (`KVMAN_RUNNING`, replacing a dead lock) and the hand-over to a running kvman;
  - opening the start folder as a workspace, and the `?workspace=<id>` URL;
  - opening the browser (`xdg-open`, `open`, `cmd /c start ""`);
  - loading the preset (bundled name, `<home>/presets/<name>.json`, or file);
  - `npm:` installs (`--ignore-scripts --omit=dev`, the in-test registry in tests);
  - the trust prompt (`--yes`, and refusing without a terminal);
  - the port (`PORT_IN_USE`);
  - the start order and the Ctrl+C sequence (a second Ctrl+C stops at once);
  - Pino logs to `logs/kvman.log`, with the short terminal log;
  - the HTTP route tests that M1.7 wrote (`milestones/M1.7-TEST-CASES.md`), run against the CLI (ADR 0009, 35).
- **Done when:**
  - `kvman --preset <file>` started in a folder prints (and, without `--no-open`, opens) the URL of that folder's workspace.
  - A second kvman on the same home hands over its folder and exits 0; with a different preset it fails `KVMAN_RUNNING`.
  - A stale lock is replaced.
  - A preset name found both bundled and in `<home>/presets/` fails `VALIDATION_FAILED`.
  - An untrusted npm extension asks, and without a terminal it refuses.
  - `--yes` accepts, and a new version asks again.
  - A taken port fails `PORT_IN_USE`.
  - Ctrl+C fails unfinished attempts with `INTERRUPTED`, keeping jobs with retries left queued.
  - Logs contain no payloads, and `--log-level` filters them.
  - Crash invariants 1, 2, 4, and 6 hold (§12.2).
  - Every M1.7 route scenario passes against a real kvman child process.

## M2 — Extensions

### M2.1 kvai

- **Read:** `07`.
- **Build:**
  - `extensions/kvai`: `kvai.complete` (pi-ai, deltas, failure codes including `kvai/NO_MODEL`, retries 0, 32 MiB input), providers and models (built-in, custom, delegate), keys from secrets, and usage totals with cache reads and writes.
  - `kvai.ui.get`: the Models page and the status item (`kvai.usage.total.get`).
  - Locales.
  - The fake OpenAI-compatible server test helper (`@kvman/testkit/fake-openai`), and the testkit's `onProgress`.
- **Done when:**
  - `kvai.complete` against the fake server streams text, thinking, and tool-call deltas to the root job and returns the message and usage.
  - A missing key, a missing model, an unknown model, a 429, and an over-long context fail with their codes.
  - `anthropic/claude-sonnet-5-5` is in pi-ai's built-in list.
  - A delegate provider forwards the call.
  - Removing a built-in fails `kvai/BUILT_IN`.
  - Usage adds up per workspace.

### M2.2 kvwebui frame

- **Read:** `06` §6.1–§6.4, §6.6–§6.8.
- **Build:**
  - `extensions/kvwebui`: the Vue app (Vite, vue-router, Tailwind, vue-i18n, `@lucide/vue`, markdown-it and DOMPurify, the IBM Plex fonts; ADR 0009, 66).
  - The frame: top bar (workspace picker, language and theme menus), a collapsible nav, panels, the status bar with the health item, toasts, and dialogs.
  - Per-tab workspaces, the `?workspace=<id>` start URL, and moving a tab to Home when its workspace closes.
  - The language switch from `kernel.health.get`, right-to-left for `ar`, `he`, `fa`, and `ur`, and translated descriptions with their English fallback.
  - Discovery through `<namespace>.ui.get`, with zod validation and error cards.
  - Routes with params, and the preset's `kvwebui.home` (required, preset-only), with the `HOME_UNAVAILABLE` card on the Extensions page.
  - Every view component except `custom` (there is no `tabs`), including `link`, `$output` in `then`, table search, "Show more", `rowLink`, `secondary` and `badges` columns, and the `boolean` format.
  - The Settings (with each key's title and scopes, and the Secrets section) and Extensions pages, and the `kvwebui.*` settings. There is no Jobs page (ADR 0009, 69).
  - `syncOnly` for extension commands (ADR 0009, 80).
  - kvai's pages without `tabs`: Models, Provider, and Add a provider, with `kvai.provider.get`, `kvai.provider.key.set` and `.delete`, `kvai.model.default.get`, and the new row fields (ADR 0009, 79).
  - Theme.
  - Right-to-left.
- **Done when:**
  - A test extension's pages, nav, panels, and status items render.
  - An invalid `ui.get` shows an error card while the others render.
  - Forms are generated from JSON Schema (a `writeOnly` string is a password field), and a failed command marks fields.
  - A sync-only command can't be queued, and kvai's provider page saves and removes a key without it reaching a job row.
  - A button whose `then` navigates with `$output` opens the created item's page, and a `link` navigates without a command.
  - Opening `/?workspace=<id>` sets the tab's workspace and drops the parameter.
  - `/` shows the preset's home page; a missing one shows the Extensions page with the `HOME_UNAVAILABLE` card; the Settings page shows `kvwebui.home` read-only.
  - Switching the language re-renders the UI in it, and a setting without `<key>.description` shows its English description.
  - Arabic renders right-to-left (Playwright).
  - Markdown can't inject HTML.

### M2.3 kvwebui custom components and effects

- **Read:** `06` §6.4 (custom), §6.5.
- **Build:**
  - `custom` components through the import map, with their CSS files and the `revision` in their URLs, and the injected `kvman` (`exec`, `execAsync`, `stream`, `follow`, `navigate`, `toast`, `panel`, `t`, `workspace`, `View`).
  - The theme CSS variables for light and dark.
  - `@kvman/sdk/web` types.
  - `kvwebui.effect.add`, `kvwebui.effect.take` (for jobs the UI starts or follows), and `kvwebui.effect.clean` on a keyed hourly schedule.
- **Done when:**
  - A custom component shares kvwebui's Vue instance, streams a job's progress chunks, renders Markdown through `View`, and its CSS loads.
  - A component's `navigate`, `toast`, and `panel` act at once.
  - A component styled with the variables follows a theme switch.
  - `follow` reruns the page's queries when the job ends.
  - Effects from a nested job apply once when the UI's job ends.
  - Restarting leaves one cleanup schedule, and effects older than an hour are cleaned.

### M2.4 kvcoder

- **Read:** `08`.
- **Build:**
  - `extensions/kvcoder`: sessions and messages, step chains with follow chunks and `stepJobId`, steering, and a message while waiting dismissing the pending items.
  - The real shell: bash on Linux and macOS, `pwsh` or `powershell.exe` on Windows, `kvcoder.shell.path`, approval, limits, truncation, and tree kills.
  - All calls of a reply in parallel, with approvals asked together.
  - The connector call path (JSON input, stdin JSON as a heredoc or a here-string, optional JSON, `-h`, `--async` with result messages, `jobs`, and refusing non-standalone lines).
  - Connector and section registration (`kvcoder.connector.*`, `kvcoder.section.*` with `global`, ownership, `kvcoder/NAME_TAKEN`, clearing at start), `-h` from descriptions, schemas, and examples, binary checks, and `runConnector` in `@kvman/kvcoder/testing`.
  - Section caps.
  - `ask` and `subagent` (fresh or fork, the parent's model, connector subsets, parallel, `--async`).
  - Compaction, cancel, interrupted steps through a `kernel.job.failed` handler, and retention (`kvcoder.sessions.keep`, keyed schedule).
  - Message, turn, and session records with usage and time totals, titles, `omitted` counts, JSON export, fork, `session.configure`, and image `fileIds`.
  - Display-only notices and notes (`kvcoder.note.add`).
  - Session points (`kvcoder.handler.*`), with handler-job ids so their injections don't start turns.
  - The UI: the Chat and session pages, the `kvcoder.conversation` and `kvcoder.sessions` components, the question and shell-result cards, the status item, and the Prompt tab (ADR 0009, 104).
  - Settings.
  - The prompt-build benchmark.
- **Done when:**
  - Against the fake model, a turn runs a shell call and a connector command in parallel, asks a question, suspends, and continues after the answer (also across a kvman restart).
  - A message sent while waiting dismisses the question and runs the next step.
  - Two parallel subagents return their answers.
  - A denied shell call reaches the model as denied.
  - An `--async` connector result arrives as a message and starts a turn.
  - A global section reaches a second workspace's prompt.
  - A new workspace opens with no session; a note is shown in the current language; notes and notices never reach the model.
  - Compaction keeps the last 10 messages.
  - Cancel stops children and questions.
  - An image attachment reaches an image model, and fails `VALIDATION_FAILED` for a text-only one.
  - The conversation reattaches to a running step after a reload (Playwright).
  - Crash invariants 3 and 5 hold.
  - The benchmark meets its target.

### M2.5 kvdev, presets, and the walkthrough

*Changed after this milestone by ADR 0010: kvdev is now kvbuilder (`09`), the scaffold, guides, and preview are testkit bins, the `dev` preset is gone and `coder` loads kvbuilder, and the kernel gains `kernel.preset.get`, `kernel.extensions.install`, and `kernel.extensions.uninstall`.*

*Changed after this milestone by ADR 0023: kvbuilder sets no global section; the agent reads its guide with `kvman init` (`09` §9.4).*

*Changed after this milestone by ADR 0027: kvbuilder is now kvbuilder (`09`), `kvman init` is gone, and the person's `/build-kvman` gives a chat kvbuilder's guide and connectors, through kvcoder's slash-command registry and `optIn` connectors (`08` §8.4, `09` §9.4).*

*Changed after this milestone by ADR 0024: `kernel.restart` restarts kvman in the same process, a start that fails because of the preset is undone from a backup, and kvbuilder's `kvman` connector has `restart` (`02` §2.14, `09` §9.1).*

*Changed after this milestone by ADR 0080: the guide of `/build-kvman` never lets the agent edit kvman itself and designs from what exists, the `kvman` connector has `extensions-get`, `createTestKernel` and `kvman-check` load a project's dependencies from its `node_modules`, and the preview adds the bundled ones (`09` §9.1 to §9.4, `10`).*

*Changed after this milestone by ADR 0082: `kvwebui.home` defaults to the Extensions page, the web scaffold type-checks and starts a Git repository, read-only helpers run other extensions' queries, a preset's `kvcoder.profile` gives kvcoder another identity, method, and wording, presets hide developer screens, extensions show their own result cards and write artifacts, the builder's guide covers products for people who aren't developers, and `pnpm desktop:brand` builds a branded desktop app (`06`, `08`, `09`, `10`, `14` §14.9).*

- **Read:** `09`; `10`; `11`; `12` §12.3.
- **Build:**
  - `extensions/kvdev`: the `ext`, `preset`, `preview`, and `docs` connectors, the scaffold (with `kvman.source`, and the web template), the preview kvman (running `web:watch`), and its global section.
  - `presets/coder.json` and `presets/dev.json`.
  - The cold-start and RSS benchmarks.
  - Also (ADR 0009, 113–126): the testkit's `kvman-check` bin; workers see the main thread's `process.argv`; links in kvcoder's result cards; the in-test registry for the scaffold's packages.
- **Done when:**
  - In the `dev` preset, with the fake model, the agent scaffolds an extension whose own test passes. `ext list` shows it, `ext check` reports a planted missing description, the preview starts and shows the new page, and an edit to `src/index.ts` hot-reloads it with no build (Playwright).
  - A `web: true` scaffold builds, its sample page shows the component in the preview, and a component edit shows after a refresh.
  - `kvman` with no flags starts the `coder` preset.
  - Every benchmark meets its target.

## M3 — Desktop

ADR 0038. M3.2 and M3.3 also pass `pnpm desktop:check` (`cargo fmt --check`, `cargo clippy` with warnings as errors, `cargo test`).

### M3.1 `kvman --pipe`

- **Read:** `01` §1.2; `02` §2.9 (trust), §2.14; `14` §14.2; `12` §12.1.
- **Build:** in the `kvman` bin:
  - the `--pipe` flag, in the usage text too;
  - the `trust`, `running`, `joined`, `restarting`, and `failed` lines in place of the terminal text on stdout;
  - the trust answer as a line on stdin, with or without a terminal;
  - the stop sequence when the input closes, on each OS, and the start that finishes first.
- **Done when:**
  - `kvman --pipe` writes one `running` line with the start workspace's URL and the port, and nothing else on stdout.
  - Closing its input stops it as the first Ctrl+C does: it exits 0, and unfinished attempts fail `INTERRUPTED`, with jobs that have retries left kept queued.
  - An input that closes while kvman starts lets the start finish, and kvman then stops and exits 0.
  - An extension version that isn't accepted writes a `trust` line with the language and the versions, with no terminal too. `{ "trust": true }` loads it and remembers it.
  - `{ "trust": false }`, any other line, and a closed input fail the start with a `failed` line carrying `EXTENSION_INVALID`, and exit 1.
  - `--yes` writes no `trust` line.
  - A second `kvman --pipe` on the same home writes a `joined` line and exits 0; with another preset it writes `failed` with `KVMAN_RUNNING` and no `language`.
  - A taken port writes `failed` with `PORT_IN_USE` and the language.
  - `kernel.restart` writes `restarting`, then `running`.
  - `kvman uninstall --pipe` fails `VALIDATION_FAILED`.
  - Without `--pipe`, the terminal text, the trust prompt, and the stop are as they were.

### M3.2 The desktop app

- **Read:** `14` §14.1, §14.3–§14.6, §14.10; `02` §2.6, §2.12 (workspaces, `kernel.settings.list`); `04` §4.2; `06` §6.2 (the start URL), §6.4 (the colours); `12` §12.1.
- **Build:** `packages/desktop`, a Tauri app run against the repository's own `kvman`:
  - one app at a time, and the window with its starting state;
  - starting `kvman --pipe --no-open` in the user's home folder, with the Node folder added last to its `PATH`;
  - the trust dialog and the failed-start dialog, in the line's language;
  - the home screen: the list, continuing into a workspace, remove, "Open a folder…" with the system's dialog, a failed call's text, the language and direction, and the colours;
  - joining a kvman that already runs;
  - the window: new windows and other origins in the system's browser, downloads, a restart, a port that changes;
  - closing: the closed input, the wait, and the end of the process tree, with a branch per OS;
  - a kvman that ends by itself;
  - the `en` and `ar` catalog, `pnpm desktop:check`, and the `desktop` import wall in ESLint.
- **Done when:**
  - A second launch focuses the open window and starts no second kvman.
  - A `trust` line shows the dialog with each version; Accept answers `{ "trust": true }`, and Quit or closing it answers `{ "trust": false }` and quits with no second dialog.
  - A `failed` line shows the Problem's code and message with the hint for its code, or the log file's path for another code, in the line's language, and Quit quits.
  - A `running` line shows the home screen with Home first and each open workspace's name and folder, with `~` for the user's home folder.
  - A click on a row loads `http://127.0.0.1:<port>/?workspace=<id>` in the same window.
  - The remove button closes that workspace and the list no longer has it; Home has no remove button.
  - "Open a folder…" opens the chosen folder as a workspace and continues into it.
  - A call that fails shows its Problem's translated text above the list, and the list stays.
  - With `kernel.language` `ar` the home screen is Arabic and right to left; with any language but `ar` it is English.
  - `kvwebui.theme` `light` and `dark` choose the colours, and `system`, or a preset with no `kvwebui.theme`, follows the system.
  - A `joined` line shows the same home screen, and closing the window then leaves that kvman running.
  - A request for a new window, and a navigation to another origin, open in the system's browser, and the window stays on kvman.
  - Closing the window closes kvman's input and the app quits once kvman has exited; a kvman that is still alive after 15 seconds has its process tree ended, on each OS.
  - A `running` line with another port after a restart moves the window to the new address.
  - A kvman that ends by itself shows the dialog that names the log file, and Quit quits.
  - The shell's calls to kvman carry no `Origin`, and its page makes no call to kvman.

### M3.3 Installers, updates, and the release

- **Read:** `14` §14.3, §14.7, §14.8; `01` §1.2 (installing); ADR 0026, 8 to 10; ADR 0038, 31 to 33 and 40.
- **Build:**
  - the bundle: the pinned Node 24 build and its npm for each system, checked against nodejs.org's checksums, and the `kvman` package with its production dependencies and `better-sqlite3`'s binary for that system;
  - the five installers, the macOS ad-hoc signature, and the Windows install for the current user;
  - the updater: the check at launch, the line on the home screen, "Install and restart", the `.deb` install's "Download", and the public key;
  - `.github/workflows/release.yml`: a job per system that builds, runs the bundle with no window, and attaches the installers, their signatures, and `latest.json` to the GitHub Release;
  - `pnpm desktop:build`, which builds the installer of the developer's OS;
  - the user guide's install page: the downloads, the macOS and Windows warnings and how to pass them, updating, and removing the app.
- **Done when:**
  - The app built on the developer's OS starts with no Node and no npm on the `PATH`, and installs an `npm:` extension with the bundled npm.
  - With a Node and an npm of the person's own on the `PATH`, kvman's `PATH` has theirs first.
  - A newer version in `latest.json` shows "kvman `<version>` is available." on the home screen, and the same or an older one shows nothing.
  - A check that fails shows nothing, and the home screen works.
  - "Install and restart" stops kvman only after the update is downloaded and its signature holds; an update with a wrong signature shows "The update could not be installed." and kvman keeps running.
  - A `.deb` install's button is "Download" and opens the release's page.
  - The workflow's run of the bundle fails the job when the `running` line doesn't come, when `kernel.health.get` fails, or when kvman doesn't exit 0 after its input closes.
  - A Node build whose checksum differs fails the build.

## M4 — VS Code

ADR 0099.

### M4.1 Framing and new windows in a frame

*Changed after this milestone by ADR 0100: `?embed=parent` replaces `?open=parent`, and the embedded page has no frame and talks to its host (`06` §6.2, M4.4).*

- **Read:** `04` §4.2; `06` §6.2, §6.4; `08` §8.7 (the MCP sign-in); `03` (the web types); `15` §15.4; ADR 0099, 2, 9, 32, and 33.
- **Build:**
  - in the kernel's listener, the `frame-ancestors` policy on every answer;
  - in kvwebui, `?open=parent` kept for the tab, the caught `target="_blank"` links, and `kvman.open`;
  - `open` in `@kvman/sdk/web`'s `Kvman` type;
  - kvcoder's MCP sign-in through `kvman.open`;
  - changesets for `@kvman/sdk`, `@kvman/kvwebui`, and `@kvman/kvcoder`.
- **Done when:**
  - Every answer carries the policy: a JSON answer, a page, a static file, a file download, a 404, and a `FORBIDDEN_ORIGIN` answer.
  - A page of another origin (`https://example.test`, served by Playwright's routing) can't show kvman in a frame, and a page on `127.0.0.1` of another port can.
  - A page opened with `?open=parent` removes the parameter from the URL and, after a reload, still hands over.
  - While it hands over, a click and a middle click on a `target="_blank"` `http:` or `https:` link post `{ kind: 'kvman.open', url }` to the parent and open no tab; a link of another scheme posts nothing.
  - `kvman.open` posts the same while the page hands over, and otherwise opens a tab and returns `'opened'`, or `'blocked'` when the tab is refused.
  - A page opened without `?open=parent` opens links and `kvman.open` tabs as before.
  - kvcoder's "Sign in" opens its address through `kvman.open`, and in a page that hands over, the parent receives it.

### M4.2 The VS Code extension

*Changed after this milestone by ADR 0100: the view is in the activity bar, frames kvwebui embedded with VS Code's theme, has buttons in VS Code's title bar, and opens files and diffs in VS Code's editor (`15`, M4.6).*

- **Read:** `15` §15.1 to §15.5, §15.7, §15.9; `14` §14.2, §14.4 (the hints); `01` §1.2 (the start folder, installing); `04` §4.2; `12` §12.1; ADR 0099.
- **Build:** `packages/vscode`, run against the repository's own `kvman`:
  - first, the by-hand check of ADR 0099, 35 in VS Code 1.106 on Linux: the view frames kvman, and a website can't;
  - the manifest: the view container in the secondary side bar, the view, the three commands, `kvman.path`, the kind `ui`, and starting on the view or a command;
  - the folder, the version check, and installing and updating with a task;
  - starting `kvman --pipe --no-open`, with a branch per OS;
  - the lines: the trust message, the failed state with its hints and the log, the frame for `running` and `joined`, a restart, a port that changes, and a line that can't be read;
  - the view's page: the frame, its policy, kept when hidden, and the messages it passes on to `vscode.env.openExternal`;
  - closing, starting again from another window, and a kvman that ends by itself;
  - a remote window;
  - the `en` and `ar` catalog and `package.nls` files, the Vite bundle, `pnpm vscode:package`, and the `vscode` import wall in ESLint.
- **Done when:**
  - Showing the view in a window with a local folder starts `kvman --pipe --no-open` in that folder, and the frame shows the line's `url` with `&open=parent`.
  - A window with no folder starts kvman in the user's home folder.
  - A window whose first folder isn't a `file:` folder shows "kvman works on local folders only for now." and runs nothing.
  - With no program at `kvman.path`, the view shows "kvman isn't installed."; "Install kvman" runs the npm task, and an exit code of 0 starts kvman.
  - A task that exits 127 shows the npm message with the link to `https://nodejs.org`, and any other failing code shows "kvman couldn't be installed." with "Try again".
  - A kvman older than `MINIMUM_KVMAN_VERSION` shows its version, the minimum, and "Update kvman", and isn't started.
  - On Windows the program is started through `cmd.exe /d /s /c`, and on Linux and macOS directly.
  - A `trust` line opens the modal message with each version; "Run them" answers `{ "trust": true }`, and closing it answers `{ "trust": false }`.
  - A `failed` line shows the code, the message, and the hint for its code, or the log's path for another code; "Show the log" opens it, and "Try again" starts kvman again.
  - A `joined` line shows the frame, and closing that window leaves kvman running.
  - Closing the window that owns kvman closes kvman's input, and kvman exits 0.
  - After the owner closes, showing the view in another window starts kvman again, and that window then owns it.
  - A `running` line with another port after a restart moves the frame to its `url`.
  - A kvman that ends by itself, and a line that can't be read, show "kvman stopped unexpectedly." with "Start again" and "Show the log".
  - A message from the frame with an `http:` or `https:` address opens it with `vscode.env.openExternal`; a message from another source or origin, of another shape, or with another scheme, opens nothing.
  - The page's policy allows only frames of `http://127.0.0.1:<port>`.
  - With VS Code in Arabic the extension's text is Arabic and right to left; in any other language it is English.
  - The extension's calls to kvman carry no `Origin`, and it never reads `secrets.json`.

### M4.3 Publishing the extension

- **Read:** `15` §15.8; ADR 0026, 8 to 10; ADR 0038, 52; ADR 0099, 36, 37, and 49.
- **Build:**
  - a `vscode` job in `.github/workflows/release.yml` that builds the `.vsix`, creates the tag's draft GitHub Release when none exists, or adds to it (ADR 0099, 49), attaches the `.vsix`, and publishes it with `vsce publish` and `ovsx publish`, with `VSCE_PAT` and `OVSX_PAT`;
  - the user guide's page for the extension.
- **Done when:**
  - `pnpm vscode:package` writes a `.vsix` with one bundled file and no `node_modules`, at the root version, and `code --install-extension` installs it.
  - The workflow's job fails when packaging fails, and publishes nothing then.
  - The user guide's page covers installing, the install offer, where the view is, local folders only, and the shared home.

### M4.4 kvwebui embedded in a host

- **Read:** `06` §6.2, §6.4; `04` §4.2; `03` (the web types); ADR 0100, 9 to 14.
- **Build:**
  - `?embed=parent` in place of `?open=parent`, kept for the tab, with the new-window handoff of M4.1;
  - the embedded page without a frame;
  - the messages to the host (`kvman.state`, `kvman.open`, `kvman.openFile`, `kvman.openDiff`, `kvman.openChange`) and from it (`kvman.theme`, `kvman.pages`, `kvman.insert`), from `window.parent` only;
  - the host's theme: the colors mixed into kvwebui's variables, light or dark, the fonts, and the root size;
  - the pages menu;
  - `kvman.host` in the injected object and `@kvman/sdk/web`, with the `en` and `ar` texts and a changeset.
- **Done when:**
  - A page opened with `?embed=parent` removes the parameter, keeps embedded after a reload, and shows the routed page with no top bar, nav, panel strip, status bar, or workspace picker; a page without it is as before.
  - The embedded page posts `kvman.state` with its workspace once booted and after a switch; a page that isn't embedded posts nothing.
  - `kvman.host.openFile`, `openDiff`, and `openChange` post their messages while embedded, and post nothing otherwise; `embedded` says which.
  - A `kvman.theme` from the parent sets kvwebui's colors, light or dark, fonts, and root font size; the same message from another window, or of another shape, changes nothing.
  - A `kvman.pages` opens the pages menu with the nav items in order, then Settings and Extensions; a pick opens the page; a press outside or Escape closes it.
  - A `kvman.insert` reaches each `onInsert` handler, and a removed handler gets nothing.
  - New-window links and `kvman.open` are handed over as in M4.1, now under `?embed=parent`.

### M4.5 kvcoder in a narrow host

- **Read:** `08` §8.6 (`kvcoder.file.preview.get`), §8.7 (in a narrow host); `06` §6.4 (`kvman.host`); ADR 0093, 3; ADR 0100, 15 to 19.
- **Build:**
  - the compact header row below 60 rem, with History and New chat;
  - `kvcoder.file.preview.get`;
  - "Open diff" on `fs edit` and `fs write` calls while embedded;
  - file paths that open in the host while embedded;
  - inserted text in the open composer;
  - the `en` and `ar` texts and a changeset.
- **Done when:**
  - Below 60 rem the History button, the title, the header's buttons, and New chat are one row; History opens the chat drawer, and New chat opens the Chat page with no chat.
  - `kvcoder.file.preview.get` gives the file with the edits applied (or the content of a write), writes nothing, and fails as `fs edit` would for an edit that doesn't apply or a path outside the workspace.
  - While embedded, an edit's approval has "Open diff", which asks the preview and calls `openDiff` with `<file name> (proposed)`; a card whose edit ran calls `openChange`; outside embedded mode there is no "Open diff".
  - While embedded, the paths in read, read-files, edit, write, find, list (files only), and search cards, and a Changes row's "Open", call `openFile` with the absolute path and line (a search's file at its first match); outside embedded mode they are text.
  - An inserted text is added to the open composer on a line of its own, in a chat and on a new chat, and the composer has the focus.

### M4.6 The VS Code extension feels native

- **Read:** `15`; `06` §6.2 (the host messages); ADR 0100, 20 to 30.
- **Build:** in `packages/vscode`:
  - the view container in the activity bar, `engines.vscode` `^1.95.0`, and `@types/vscode` 1.95.0;
  - the title bar's Pages, Settings, and Open in browser, and the frame's workspace from `kvman.state`;
  - Settings in one editor tab;
  - the theme read from VS Code and sent on `kvman.state` and on a theme change;
  - `kvman.openFile`, `kvman.openDiff`, and `kvman.openChange` in VS Code's editors, each message checked with zod;
  - "Add to kvman chat" from the editor and the explorer;
  - the `en` and `ar` texts and the `package.nls` titles;
  - first, the by-hand check of the theme and the Pages menu in a real VS Code, as in M4.2.
- **Done when:**
  - The manifest has the activity-bar container, the three title-bar buttons on `kvman.view`, `kvman.addToChat` in the editor and explorer context menus, and `engines.vscode` `^1.95.0`.
  - The frame is the line's URL with `&embed=parent`.
  - A `kvman.state` from the frame is answered with a `kvman.theme` built from VS Code's variables, and a change of VS Code's theme sends it again.
  - Pages sends `kvman.pages` to the frame; Open in browser opens the frame's workspace; Settings opens one tab framing the settings page of that workspace, and a second press shows it.
  - `kvman.openFile` shows the file at its line; `kvman.openDiff` opens the diff of the file against `after` with the title, and of an empty document when the file is missing; `kvman.openChange` runs `git.openChange`, and a failure shows the message; a relative path, or another shape, opens nothing.
  - "Add to kvman chat" with a selection sends the path, the lines, and the fenced code; with a file, its path; with no frame yet, it starts kvman and sends once `kvman.state` comes.
  - With VS Code in Arabic the new texts are Arabic.
