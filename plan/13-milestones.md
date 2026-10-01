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
  - Message, turn, and session records with usage and time totals, titles (strings or keys), `omitted` counts, JSON export, fork, `session.configure`, and image `fileIds`.
  - Display-only notices and notes (`kvcoder.note.add`), and the welcome session at `kernel.workspace.opened`.
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
  - Opening a new workspace creates the welcome session with its note, shown in the current language; notes and notices never reach the model.
  - Compaction keeps the last 10 messages.
  - Cancel stops children and questions.
  - An image attachment reaches an image model, and fails `VALIDATION_FAILED` for a text-only one.
  - The conversation reattaches to a running step after a reload (Playwright).
  - Crash invariants 3 and 5 hold.
  - The benchmark meets its target.

### M2.5 kvdev, presets, and the walkthrough

- **Read:** `09`; `10`; `11`; `12` §12.3.
- **Build:**
  - `extensions/kvdev`: the `ext`, `preset`, `preview`, and `docs` connectors, the scaffold (with `kvman.source`, and the web template), the preview kvman (running `web:watch`), and its global section.
  - `presets/coder.json` and `presets/dev.json`.
  - The cold-start and RSS benchmarks.
- **Done when:**
  - In the `dev` preset, with the fake model, the agent scaffolds an extension whose own test passes. `ext list` shows it, `ext check` reports a planted missing description, the preview starts and shows the new page, and an edit to `src/index.ts` hot-reloads it with no build (Playwright).
  - A `web: true` scaffold builds, its sample page shows the component in the preview, and a component edit shows after a refresh.
  - `kvman` with no flags starts the `coder` preset.
  - Every benchmark meets its target.
