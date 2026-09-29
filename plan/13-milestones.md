# 13 — Milestones

Do them strictly in order. Each one follows `CLAUDE.md` §2:
1. Read its sections.
2. Ask about any gap.
3. Write `milestones/<id>-TEST-CASES.md`.
4. Build exactly its Build list.
5. Write one test per scenario.
6. Pass `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check`.
7. Add a README row, then commit.

`bench:check` passes with no benchmarks until M1.3 adds the first one.

## M1 — Kernel

### M1.1 Monorepo

- **Read:** `01` §1.4; `12` §12.1; `CLAUDE.md`.
- **Build:**
  - The pnpm workspace (Node 24) and TypeScript strict, with the `CLAUDE.md` §5 flags.
  - ESLint with the import walls of §1.4 (including the exported-subpath rule), `max-lines` 300, and no `any`.
  - Vitest, and the gate scripts `typecheck`, `lint`, `test`, `build`, `bench:check` (the benchmark runner, with no benchmarks yet).
  - Changesets for `sdk`, `testkit`, and `extensions/*`.
  - Empty `packages/sdk`, `kernel`, `cli`, and `testkit`.
  - `.gitignore` and the README skeleton.
- **Done when:**
  - All gates run green on the empty packages.
  - A file that breaks a wall, or that has 301 lines, fails `pnpm lint`.

### M1.2 SDK

- **Read:** `03`; `05`; `02` §2.9–§2.10; `04` §4.1.
- **Build:** `@kvman/sdk`:
  - the `Ctx` types (§3.1–§3.4) and `z`;
  - the zod schemas and types for the extension manifest (`kvman` field), preset, Problem (with the kernel codes), job row, workspace, file row, and the HTTP envelope;
  - the empty `Commands` and `Queries` maps with typed `exec`;
  - one-line TSDoc on every export.
- **Done when:**
  - Valid and invalid manifests, presets, and envelopes parse or fail with the right issues.
  - A declared `Commands` entry gives typed input and output to `ctx.exec`, and an undeclared name takes and returns `unknown` (a type test).

### M1.3 Storage

- **Read:** `02` §2.5, §2.7, §2.8, §2.13; `01` §1.3.
- **Build:**
  - Opening `kvman.db` (WAL, busy timeout), and the kernel tables for stores, settings, files, jobs, schedules, workspaces, and accepted extensions.
  - The store API: `kv`; collections with `insert`, `get`, `find` (equality, `limit` ≤ 1000), `update` (shallow merge), and `delete`; synchronous `transaction(tx => …)`; the workspace and `global` scopes.
  - Settings resolution (workspace → global → preset → default).
  - `secrets.json` (mode 0600, atomic replace).
  - Files (`files/<id>`, rows, the 1 GiB cap).
  - UUIDv7 ids with an injected clock and random source.
  - The collection `find` benchmark.
- **Done when:**
  - Writes from two worker threads through their own connections are both visible.
  - An async `transaction` callback rolls back with `VALIDATION_FAILED`.
  - `find` without a limit, or with more than 1000, fails.
  - Settings resolve in order.
  - A secret never appears in SQLite or in logs.
  - A file over 1 GiB fails `TOO_LARGE`.
  - The benchmark meets its target.

### M1.4 Extensions and workers

- **Read:** `02` §2.1, §2.2, §2.9 (bundled and path sources, loading, access), §2.13; `03`; `10`.
- **Build:**
  - Reading the `kvman` manifest; `bundled` and `path:` sources; dependency order; the `EXTENSION_INVALID` checks.
  - The worker pool (`kernel.workers`, `kernel.workerConcurrency`), with each worker loading every extension.
  - `AsyncLocalStorage` for the current job, including `ctx.job` (`id`, `rootId`, `workspace`, `caller`, `signal`, `progress`).
  - Sync `ctx.exec`, with input and output validation, `public` access (`NOT_PUBLIC`), read-only queries (`READ_ONLY`), depth 16 (`TOO_DEEP`), and per-registration size caps (`TOO_LARGE`).
  - `HANDLER_FAILED` for unknown errors, `WORKER_CRASHED` with replacement, and timeouts (`TIMEOUT`).
  - `@kvman/testkit` `createTestKernel` (§10).
  - The `ctx.exec` benchmark.
- **Done when:**
  - Every loading rule, including a dependency cycle, stops the kernel with `EXTENSION_INVALID` and the offending extension (or the cycle) named.
  - A handler sees its own workspace and caller while 32 jobs interleave on one worker.
  - Each access rule, limit, and depth rule fails with its code.
  - A crashed worker's jobs fail `WORKER_CRASHED` and a new worker takes over.
  - The benchmark meets its target.

### M1.5 Async jobs and schedules

- **Read:** `02` §2.1 (rows, retention), §2.3, §2.4, §2.14 (stop), §2.15; `12` §12.2.
- **Build:**
  - `execAsync` job rows with first-in, first-out start, retries with backoff, `ctx.problem` without retry, and cancel (`ctx.cancel`) with shared signals for nested sync jobs.
  - Retention.
  - Resuming queued and running jobs at start.
  - `ctx.schedule` (`at`, `cron` with croner), `schedule.cancel`, the one-time delete, and a missed run once at start.
  - Nested progress to the root job.
  - Handler points (§2.15): `ctx.registerHandler`, delivery in the job's final transaction, loop safety, and `kernel.started` and `kernel.stopping`.
  - The shutdown sequence (abort, 10 s, workers stop, jobs stay queued).
  - `kernel.started` handlers in dependency order before the kernel reports ready (10 s budget).
  - Resuming tested by closing and reopening a test kernel on the same home. The SIGKILL crash tests come in M1.8, once the bin exists.
  - The `execAsync` benchmark.
- **Done when:**
  - A failing job retries three times with 1, 2, and 4 s backoff (fake clock), then ends `failed`.
  - A cancelled job ends `cancelled` and its nested sync job sees the abort.
  - A cron schedule runs at each due time, and a missed one runs once.
  - A failed sync job and a failed async job each queue one `kernel.job.failed` handler job. A handler that fails, or that runs a failing nested job, triggers no handlers. `kernel.started` runs once per start.
  - A test kernel reopened on the same home resumes a queued job and never reruns a finished one.
  - The benchmark meets its target.

### M1.6 Workspaces, kernel API, localization, hot reload

- **Read:** `02` §2.6, §2.8, §2.11, §2.12, §2.9 (hot reload), §2.16.
- **Build:**
  - Home, and `kernel.workspace.*`.
  - The rest of `kernel.*` (settings, secrets, jobs, files, extensions, and health, with JSON Schemas).
  - `ctx.settings.set` (own keys only), and `ctx.files` (`read`, `path`, and access rules).
  - Locale catalogs merged per language.
  - `path:` hot reload (a watch, a reload in every worker, and the old code kept on failure).
  - The process service (§2.16), `kernel.processes.list`, and the `kernel.process.exited` point.
  - Running a hot-reloaded extension's `kernel.started` handler again.
- **Done when:**
  - Every `kernel.*` command and query behaves as §2.12 says, including opening an open folder and closing Home.
  - `kernel.secrets.list` never returns a value.
  - An edited `path:` extension serves new registrations while a running job finishes on the old code, and a broken edit keeps the old code.
  - A started process logs its output, survives a hot reload, triggers `kernel.process.exited` when it exits, and a second start of the same name fails `PROCESS_RUNNING`.

### M1.7 HTTP

- **Read:** `04`; `02` §2.9 (web files).
- **Build:**
  - Hono on 127.0.0.1, with Host and Origin checks (`FORBIDDEN_ORIGIN`).
  - The envelope routes for commands (sync and async) and queries, with the `jobId`.
  - Jobs: get, cancel, and the SSE stream (`progress`, `result`, `problem`).
  - File upload (raw body) and download.
  - Locales.
  - Static `kvman.web` folders, and `/` with the `index.html` fallback.
  - The HTTP benchmark.
- **Done when:**
  - Every route answers as §4 says.
  - A foreign Host or Origin gets `FORBIDDEN_ORIGIN`.
  - The stream delivers a nested job's progress, then the result.
  - A finished job's stream answers at once.
  - A path outside a web folder gets 404.
  - The benchmark meets its target.

### M1.8 CLI

- **Read:** `01` §1.2–§1.3; `02` §2.9 (npm, trust), §2.10, §2.14; `12` §12.2.
- **Build:** the `kvman` bin:
  - flags, `--help`, and `--version`;
  - `kvman.lock` (`KVMAN_RUNNING`);
  - loading the preset (bundled name or file);
  - `npm:` installs (`--ignore-scripts --omit=dev`, local registry in tests);
  - the trust prompt (`--yes`, and refusing without a terminal);
  - the port (`PORT_IN_USE`);
  - the start order and the Ctrl+C sequence (a second Ctrl+C stops at once);
  - Pino logs to `logs/kvman.log`, with the short terminal log.
- **Done when:**
  - `kvman --preset <file>` starts and prints the URL.
  - A second kvman on the same home fails `KVMAN_RUNNING`.
  - An untrusted npm extension asks, and without a terminal it refuses.
  - `--yes` accepts, and a new version asks again.
  - A taken port fails `PORT_IN_USE`.
  - Ctrl+C leaves unfinished async jobs queued.
  - Logs contain no payloads.
  - Crash invariants 1, 2, 4, and 6 hold (§12.2).

## M2 — Extensions

### M2.1 kvai

- **Read:** `07`.
- **Build:**
  - `extensions/kvai`: `kvai.complete` (pi-ai, deltas, failure codes, retries 0, 32 MiB input), providers and models (built-in, custom, delegate), keys from secrets, usage totals.
  - `kvai.ui.get`: the Models page and the status item.
  - Locales.
  - The fake OpenAI-compatible server test helper.
- **Done when:**
  - `kvai.complete` against the fake server streams text, thinking, and tool-call deltas to the root job and returns the message and usage.
  - A missing key, an unknown model, a 429, and an over-long context fail with their codes.
  - A delegate provider forwards the call.
  - Removing a built-in fails `kvai/BUILT_IN`.
  - Usage adds up per workspace.

### M2.2 kvwebui frame

- **Read:** `06` §6.1–§6.4, §6.6–§6.8.
- **Build:**
  - `extensions/kvwebui`: the Vue app (Vite, vue-router, Tailwind, vue-i18n, lucide, markdown-it and DOMPurify).
  - The frame: top bar, nav, panels, and status bar.
  - Per-tab workspaces.
  - Discovery through `<namespace>.ui.get`, with zod validation and error cards.
  - Routes with params, and `kvwebui.home`.
  - Every view component except `chat` and `custom`.
  - The Settings, Jobs, and Extensions pages, and the `kvwebui.*` settings.
  - Theme.
  - Right-to-left.
- **Done when:**
  - A test extension's pages, nav, panels, and status items render.
  - An invalid `ui.get` shows an error card while the others render.
  - Forms are generated from JSON Schema, and a failed command marks fields.
  - Arabic renders right-to-left (Playwright).
  - Markdown can't inject HTML.

### M2.3 kvwebui chat and effects

- **Read:** `06` §6.4 (chat, custom), §6.5.
- **Build:**
  - The `chat` component: text deltas, component chunks, follow chunks, and Stop.
  - `custom` components through the import map, with the injected `kvman` (`exec`, `execAsync`, `stream`, `follow`, `t`, `workspace`).
  - `kvwebui.effect.add` and `kvwebui.effect.take`, and the 1-hour cleanup schedule.
- **Done when:**
  - A chat streams a job, follows a chained job in the same bubble, and renders a component chunk.
  - Stop cancels.
  - Effects from a nested job apply once when the UI's job ends.
  - A custom component shares kvwebui's Vue instance.

### M2.4 kvcoder

- **Read:** `08`.
- **Build:**
  - `extensions/kvcoder`: sessions and messages, step chains with follow chunks, and steering.
  - Real bash (approval, limits, truncation).
  - The connector call path (JSON input, `-h`, `--async` with result messages, `jobs`).
  - Connector and section registration (`kvcoder.connector.*`, `kvcoder.section.*`, ownership, `kvcoder/NAME_TAKEN`, clearing at start), `-h` from descriptions, schemas, and examples, binary checks, and `runConnector` in `@kvman/kvcoder/testing`.
  - Section pulls with timeouts and caps.
  - `ask` and `subagent` (fresh or fork, connector subsets, parallel, `--async`).
  - Compaction, cancel, the restart rules, and retention.
  - Message, turn, and session records with usage and time totals, titles, `omitted` counts, JSON export, and fork.
  - Session points (`kvcoder.handler.*`), with handler injections that don't start turns.
  - The UI (Chat page, cards, status item, Prompt tab).
  - Settings.
  - The prompt-build benchmark.
- **Done when:**
  - Against the fake model, a turn runs bash and a connector command, asks a question, suspends, and continues after the answer (also across a kvman restart).
  - Two parallel subagents return their answers.
  - A denied bash call reaches the model as denied.
  - An `--async` connector result arrives as a message and starts a turn.
  - Compaction keeps the last 10 messages.
  - Cancel stops children and questions.
  - Crash invariants 3 and 5 hold.
  - The benchmark meets its target.

### M2.5 kvdev, presets, and the walkthrough

- **Read:** `09`; `10`; `11`; `12` §12.3.
- **Build:**
  - `extensions/kvdev`: the `ext`, `preset`, `preview`, and `docs` connectors, the scaffold, the preview kvman, and sections.
  - `presets/coder.json` and `presets/dev.json`.
  - The cold-start and RSS benchmarks.
- **Done when:**
  - In the `dev` preset, with the fake model, the agent scaffolds an extension whose own test passes. `ext check` reports a planted missing description, the preview starts and shows the new page, and an edit hot-reloads it (Playwright).
  - `kvman` with no flags starts the `coder` preset.
  - Every benchmark meets its target.
