# 15 — Milestones and Risks

## 15.1 How to execute this plan

The work is split into **8 phases** (M0–M7) and **57 milestones** (M0.1–M7.3). A milestone is one to four days of work that ends in something that runs and is tested. Execute them strictly in order, one at a time; the only allowed overlap is stated in §15.3.

For every milestone:

1. **Read** the plan sections listed under *Read*. They are the specification. Names, shapes, codes, and defaults in them are exact: use them as written. `00` wins over every other file. Anything unclear, missing, or contradictory is asked about now, before step 2 (`14` §14.4).
2. **Write the scenarios** in `milestones/<id>-TEST-CASES.md` (e.g. `milestones/M1.4-TEST-CASES.md`) before any code: happy-path and edge-case scenarios with ids, one per *Done when* bullet plus every edge case the read sections name, each mapped to a test file (`14` §14.4).
3. **Implement** only what the *Build* list says. Do not build ahead into a later milestone; a later milestone may extend a module an earlier one created.
4. **Write the tests** that match the scenarios one to one, named with their ids.
5. **Pass everything**: every test in the repository and the gates `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check`.
6. **Record** in the root `README.md` what now works and how to run it; every question answered on the way is an ADR in `plan/adr/`.

A milestone is done only when all its *Done when* bullets are demonstrated by automated tests and all gates are green.

## 15.2 Phase overview

| Phase | Scope | Milestones | Days |
|---|---|---|---|
| M0 | Foundations: monorepo, protocol schemas, spikes | M0.1–M0.5 | 8 |
| M1 | Kernel core: storage, messaging, scheduler, hosts, lifecycle, adapters, fault injection | M1.1–M1.9 | 17 |
| M2 | Extension system and platform services | M2.1–M2.14 | 29.5 |
| M3 | Shell and UI contract; PDF example | M3.1–M3.10 | 21 |
| M4 | Agent pack; Coding Agent acceptance | M4.1–M4.6 | 19 |
| M5 | Platform pack and presets | M5.1–M5.5 | 10 |
| M6 | Self-extension (builder) | M6.1–M6.5 | 14 |
| M7 | Hardening and release | M7.1–M7.3 | 10 |
| | **Total** | **57** | **128.5 working days ≈ 26 weeks** |

Estimates assume one experienced developer working with AI assistance.

## 15.3 Dependencies

```
M0 ─▶ M1 ─▶ M2 ─┬─▶ M3 ─┬─▶ M5 ─▶ M6 ─▶ M7
                └─▶ M4 ─┘
```

Inside a phase, each milestone needs the one before it unless *Needs* says otherwise. **Allowed overlap:** M4.1–M4.5 need only M2 (their handlers are tested with the testkit); M4.6 needs M3.8. Everything else is sequential.

## 15.4 Milestones

### M0 — Foundations

#### M0.1 Monorepo scaffold — 1.5 days
- **Needs**: —
- **Read**: `01` (all), `14` §14.1, §14.4, §14.7, `00` D55.
- **Build**: pnpm workspace + Turborepo; `tsconfig.base.json` with the strict flags of `14` §14.1; ESLint flat config with the import walls (`no-restricted-imports`) and `max-lines: 300`; Vitest; Playwright installed; packages `protocol`, `sdk`, `kernel`, `testkit`, `shell`, `widget-bridge`, `cli`, `devtools` with empty entry points; scripts `typecheck`, `lint`, `test`, `build`, `bench:check` (a no-op until M1.9); changesets; `plan/adr/0000-template.md`; latest stable dependency versions pinned exactly (TypeScript held at 6.x, ADR 0005). No CI workflow for now: the gates run locally (ADR 0007).
- **Done when**: every script passes on the empty packages; a fixture file that imports across a wall fails lint; a 301-line fixture file fails lint.

#### M0.2 Protocol: messaging core — 1.5 days
- **Read**: `02` (all), `13` §13.1–§13.2, `04` §4.3 (filter language).
- **Build** in `@kvman/protocol`: schemas for `Address`, `Message`, the three kinds, event delivery classes, `access`, `LiveChunk`, `ReplyPayload`, `Problem`, `Issue`; the kernel error-code list of `13` §13.2 as constants; request bodies of `12` §12.2. Pure helpers: canonical JSON and SHA-256 digest; the naming-grammar checker with fix hints and the built-in past-participle list (`02` §2.4); the filter-language schema and an evaluator over plain objects (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `prefix`, `exists`, `$or`).
- **Done when**: every schema round-trips fixtures and converts with `z.toJSONSchema`; the grammar checker accepts every example name in `02` §2.4 and rejects `pdf.translated` as a command with the documented hint; the evaluator passes a table test for every operator.

#### M0.3 Protocol: extensions, presets, LLM — 1.5 days
- **Read**: `05` §5.3–§5.8, §5.11–§5.12, `06` §6.1, `07` §7.3.
- **Build**: the `Manifest` schema exactly as `05` §5.12 (every `ext` call of `05` §5.3, JSON Schema for schemas, lane templates, function references); handler metadata (`lane` presence, `access`, `slash`, `agentTool` incl. `hiddenFields`, timeouts); capability names and the `Capabilities` grant shape of `05` §5.7; the source grammar; `Preset` (`presetVersion: 1`); config `.meta` fields (`label`, `help`, `secret`, `ui`); `LlmRequest`, `LlmResult`, `ModelDef`, provider metadata; the stage result shape.
- **Done when**: the pdf manifest of `05` §5.2 (recorded by hand as a fixture) and the kiosk preset of `07` §7.3 validate; fixtures with a loose npm range, a secret in config, and a missing description fail with the right paths.

#### M0.4 Protocol: UI contract — 2 days
- **Read**: `08` §8.3–§8.9, §8.11, §8.15–§8.16, `12` §12.3, §12.7.
- **Build**: the base types of `08` §8.5 (`Text`, `Binding`, `Condition`, `PageQuery`, `Format`, `FieldOverride`, `FormOverrides`, `Column`); `ViewNode`, `Action`, `Effect`; every contribution shape; `SlotDef`; the frame slot catalog (`08` §8.3) as data; a `ComponentSpec` for every built-in component of `08` §8.8 (props, events, children, one example each, `since: '2.0.0'`); `CompositeDef`, `WidgetDef`; `UiRegistry`, `UiItem`; `Toast`, `Notification`, `NoticeAction`; the catalog format; SSE message shapes; the schema-endpoint shape; a binding-path parser.
- **Done when**: the pages of `08` §8.21 validate; every component spec's example validates against its own props; fixtures with a `tab` outside `tabs`, an unknown prop, and a malformed binding path fail with paths.

#### M0.5 Spikes and ADRs — 1.5 days
- **Read**: `00` R-Q1, R-Q2, R-Q8, `03` §3.5 (sandboxed processes), `11` §11.5, `14` §14.6.
- **Build**: a `better-sqlite3` throughput script (WAL, batched transactions, read-only connections in worker threads) → ADR 0001 with numbers; a Node 24 permission-model probe (fs, child process, worker, addon denial; `node:sqlite` unavailable under `--no-experimental-sqlite` through `import`, `require`, and `process.getBuiltinModule`; network flag detection) → ADR 0002; the pi-ai package name and version pinned → ADR 0003; a builder-toolchain spike (TypeScript compiler API and esbuild in a child process; a bundled `node:test` file run under the test-process flags of `11` §11.5) → ADR 0004.
- **Done when**: the four ADRs exist with measured results; the probe script is kept in `packages/kernel/scripts/` for M2.4 and runs in CI.

### M1 — Kernel core

#### M1.1 Storage engine — 2 days
- **Read**: `04` §4.1–§4.2, §4.8 (kernel part), `03` §3.11.
- **Build**: the driver interface and the `better-sqlite3` adapter; database open with the pragmas of `04` §4.1 and mode 0600; the kernel migration runner and `schema_versions`; the full kernel DDL of `04` §4.1; the commit pipeline (queue, group commit every ≤2 ms or 64 units, one savepoint per unit, version checks, `STORAGE_CONFLICT`); the read-only connection factory. The commit rule for a failed send with `onReply` (inserted as a failed command whose continuation is delivered, `04` §4.2).
- **Done when**: a unit is applied completely or not at all (tests inject failures mid-unit); a conflicting version rolls back only that unit; batching commits many units in one transaction; a database with a newer schema version refuses to open with `SCHEMA_TOO_NEW` and writes no data (ADR 0035). A send with `onReply` to an unknown type commits the sender's unit and delivers the failure to the continuation; one without `onReply` fails the unit.

#### M1.2 Store API and step journal — 2 days
- **Read**: `04` §4.3–§4.5.
- **Build**: `ctx.store.kv`, `collection()` (declared indexes as partial expression indexes, `find` with `where`/`orderBy`/`limit` returning arrays, `count`, the result cap and scan cap with `STORE_RESULT_TOO_LARGE`), `log()` (`append` returning its seq, `read` with `after`/`before`/`last`), `global`, automatic version tracking, the read-your-writes overlay over the pending unit, and the step journal (`begin`, `record`, `retrySafe` default false, `STEP_DUPLICATE`, `EFFECT_INDETERMINATE`).
- **Done when**: conformance tests cover every method with the return types of `04` §4.3; reads inside a unit see its own pending writes (including `find` and `count` after puts and deletes); a read-then-write loses to a concurrent write with `STORAGE_CONFLICT` and succeeds on the rerun; two appends in one unit get consecutive seqs; a `find` over the cap fails instead of truncating; a step started but not recorded throws `EFFECT_INDETERMINATE` unless `retrySafe`; a reused step name throws `STEP_DUPLICATE`.

#### M1.3 SDK core and registry — 2 days
- **Read**: `05` §5.1, §5.3 (permission, handler, and data rows), §5.5; `03` §3.1 item 6.
- **Build**: `defineExtension(meta, setup)`; the recording `ext` for the handler, data, and permission calls, including `registerError` and `registerDataVersion`; full public names and plain private names (`05` §5.3); typed references; closing `ext` after `setup`; the name-set rules of `05` §5.3; the kernel registry built from manifests (lookup by type and workspace). Until M2.2 the recorder runs in-process for tests.
- **Done when**: recording the pdf example's non-UI calls produces the M0.3 fixture exactly; a second recording is compared for determinism; calling `ext` after `setup` throws; duplicate names in one name set fail; `registerCommand('translate')` fails with the hint "did you mean 'pdf.translate'?".

#### M1.4 Router and admission — 2 days
- **Read**: `02` §2.2–§2.7, §2.10, `03` §3.3.
- **Build**: admission steps 1–7 of `03` §3.3 (Ajv validation compiled per type, lane templates of `02` §2.6); context inheritance (the locale default is `en` until M2.11); inbox rows inside the sender's unit or a standalone transaction; idempotency with request digests; `access` checks for every source type (`02` §2.4); the pending index. Step 2 is assigned in full here (priority defaults, inheritance, lowering; `notBefore`; explicit `deadlineAt`); M1.5 selects and fires timers, M1.7 inherits deadlines (ADR 0051).
- **Done when**: each admission failure code (`VALIDATION_FAILED`, `TYPE_NOT_FOUND`, `HANDLER_UNAVAILABLE`, `CAPABILITY_DENIED`, `CALLER_NOT_ALLOWED`, `IDEMPOTENCY_MISMATCH`) has a test; the same idempotency key and digest returns the original message ID.

#### M1.5 Scheduler — 1.5 days
- **Read**: `03` §3.4, `02` §2.6.
- **Build**: lanes, priority classes with defaults, inheritance, lowering-only and aging (`02` §2.6), fair round-robin across workspaces and lanes, concurrency limits, the query priority path with its reserved host share, timers (`notBefore`, `delayMs`, `at`), retries with backoff and max attempts, dead letters, `LANE_REENTRANT` detection.
- **Split**: the scheduler reaches hosts through a dispatcher interface that M1.6 implements (ADR 0060); a dead message stores its `MESSAGE_DEAD` reply and M1.6 delivers stored replies to waiters (ADR 0062); M1.5 builds and tests the `LANE_REENTRANT` check, M1.6's `ctx.command` calls it and tests it end to end (ADR 0063).
- **Done when**: one message per lane runs at a time in `seq` order; a flood in one workspace does not starve another; retries of a handler with `maxAttempts: 4` follow 1 s → 5 s → 30 s and end `dead` with `kernel.message.dead-lettered` (ADR 0059); a `ctx.command` into an ancestor's lane fails at once; a message sent by a handler of a user command is `interactive`, and a request for a higher class is lowered.

#### M1.6 Shared hosts and `ctx` messaging — 2.5 days
- **Read**: `03` §3.2, §3.5 (shared pool, host protocol, handler rules), `02` §2.3, §2.8, `05` §5.4 (messaging, store, step, ids, now, log), §5.9.
- **Build**: the shared worker pool; host protocol frames with validation; module loading by re-running `setup` and binding functions; `ctx.command`, `send` (with `idempotencyKey`), `query`, `publish` (durable and transient events), `problem` with registered errors, `context`, `workspace`, `live` (live events with the `LiveChunk` shapes and kernel resets, `02` §2.3, §2.5), `defer` (with `onAbort`), `reply`, `step`, `store`, `ids`, `now`, `log`, `message` (ADR 0066); the one dispatch path for every kind; continuations (`onReply`).
- **Done when**: a conformance suite covers every kind and all three request/reply patterns, including `REPLY_NOT_AWAITING` for a second reply; queries cannot write; `ctx.ids.new()` and `ctx.now()` repeat on redelivery; a live event of another extension cannot be published and a subscription to a live event fails validation; an attempt that publishes live events and then crashes gets `{ reset: true }` for its `run` on each `<type>:<key>` before the retry publishes again, and a reset never removes another run's chunks; a reply is stored with its command and reaches `ctx.command` and a continuation.
- **Split**: `onAbort` on deadline moves to M1.7 and the late HTTP caller to M1.8; M1.6 includes `ctx.message` (ADR 0066). A worker that exits fails its running attempts as retryable `INTERNAL` after resetting their live events, and the pool starts a new worker on the next need; M1.7 adds supervision (ADR 0067).

#### M1.7 Deadlines, cancellation, supervision — 1.5 days
- **Read**: `02` §2.9, `03` §3.4 (deadlines), §3.6.
- **Build**: message deadlines vs handler timeouts (`02` §2.9): inheritance per send style, the invocation deadline at claim, `DEADLINE_EXCEEDED` for pending/awaiting/running messages, retryable `HANDLER_TIMEOUT`, and `AbortSignal`; `kernel.cancel` by message (causation descendants) and by correlation, with its permission rule; late-result discard; host crash handling and redelivery; stuck-host detection after the 2 s grace; quarantine status and events.
- **Done when**: cancelling a message cancels a `ctx.command` call and a deferred command it caused; cancelling a finished message returns `{ cancelled: 0 }`; a crashing handler is redelivered with `attempts + 1`; three crashes in 10 minutes quarantine the extension with reason `HOST_FAILURES`; a handler that exceeds its `timeoutMs` is retried with a fresh timeout, while a message whose `deadlineAt` passed (in a lane queue or while running) fails `DEADLINE_EXCEEDED` without retry; a `ctx.send` from a handler does not inherit the parent's deadline, a `ctx.command` does; a deferred command whose deadline passes sends its `onAbort` (ADR 0066).
- **Split**: kernel commands run in an in-process kernel host (ADR 0078); the quarantine notification comes with M2.12 and the risk banner with the shell (ADR 0080); the nested `ctx.command` depth limit (ADR 0085) lands here.

#### M1.8 Lifecycle and minimal adapters — 2 days
- **Read**: `03` §3.9–§3.10, `12` §12.1–§12.3, §12.8–§12.9, `13` §13.3, `00` R-Q4.
- **Build**: `daemon.lock` with takeover; boot, recovery, and shutdown; home-folder resolution (`--home`, `KVMAN_HOME`) and the `HOME_INVALID` check; `kvman start` (background, with `--foreground`), `stop`, `status`; the HTTP adapter (`/health`, `/commands/:type`, `/queries/:type`, `/messages/:id`); the SSE adapter (`hello`, `event`, `live`, `reply`, `resync`, `close`, subscriptions, `Last-Event-ID` resume, 1 MB backpressure); Host, Origin, and `Sec-Fetch-Site` checks. Port fallback 4173–4199 recorded in the lock, and `--port`; the Origin rule of `12` §12.8 (present → must match; absent → allowed); `kernel.shutdown` and `kernel.health.get`; Pino with the rotating log file behind the kernel logger (ADRs 0073, 0093).
- **Done when**: a second `kvman start` fails `DAEMON_CONFLICT`; a stale lock is taken over; a home folder with other files and no `kvman.db` is refused with `HOME_INVALID`; `kvman start` returns once `/health` answers while the daemon keeps running; a command still running after `wait` answers `202` and its reply arrives on the stream; a reconnect with `Last-Event-ID` replays missed events; a request with a foreign `Host` gets 403; a reply reaches a caller whose request already ended, through `GET /messages/:id` (ADR 0066). A second kernel in another home folder starts on 4174 and the CLI finds each through its lock; a POST with a foreign `Origin` fails `HOST_FORBIDDEN` while a POST without `Origin` succeeds.
- **Split**: boot builds steps 0–2, 6 (without trust and processes), 7, 8, and the `kvman.version` record; the other steps land with M2.2, M2.3, M2.5, M2.6, M2.7, and M2.8 (ADR 0089). `--unsafe-bind` is in the backlog (ADR 0097).

#### M1.9 Fault injection, model tests, benchmarks — 1.5 days
- **Read**: `14` §14.2–§14.3, §14.6.
- **Build**: the named fault points; a child-process kernel harness that kills at each point and restarts; checks for the invariants of `14` §14.3 that apply; a fast-check model of lanes and replies; the benchmark runner with a stored baseline, `bench:check`, and `bench:record` (ADRs 0100–0104). The fault points and invariants of `14` §14.3 that M1 code reaches (the rest are added by the milestones that build their mechanisms: secrets and forget M2.3, blobs M2.5, processes M2.6, reload and migration M2.7, preset apply M2.8, guards M4.3, dev build M6.1); the first benchmark baseline.
- **Done when**: every fault point passes all invariants; the model test runs 1,000 sequences clean; the targets of `14` §14.6 that apply to the kernel are met or adjusted by ADR.

### M2 — Extension system and platform services

#### M2.1 Structural validation and schema endpoint — 2 days
- **Read**: `06` §6.3 (structural, non-UI), `02` §2.4, §2.6, `05` §5.1 (setup rules), §5.12, `12` §12.7.
- **Build**: structural validation with issues and hints (manifest schema, `manifestVersion`, the 5 MB limit, namespace rules and reserved names, descriptions, lossless JSON Schema conversion, lane templates against input schemas, name sets, naming-grammar severities); `kernel.validate`; `kernel.schema.get` and `GET /schema` for types, entities, and errors, with the ranked text search `q` (ADRs 0106–0112: config field descriptions, required types covered by capabilities, grammar warnings until the builder, lane paths, what `kernel.validate` accepts, the schema endpoint's contents and search).
- **Done when**: each structural rule has a failing fixture with its hint (including a `.transform()` schema and a lane template naming a missing field); `/schema` omits `internal` types and filters by workspace; a `.refine()` rule rejects a payload in the host with `VALIDATION_FAILED` although the kernel's JSON Schema check passed.

#### M2.2 Install pipeline — 3 days
- **Read**: `06` §6.1–§6.2, §6.5 (rehash), §6.8–§6.9, `03` §3.5 (loader).
- **Build**: sources `npm`, `git`, `builtin`, `dev`, `local`; staging with install scripts disabled through the bundled pnpm; the undeclared-import scan (es-module-lexer); the built-files and native-addon checks; the file list and digest; the sandboxed loader process that records `setup`; `kernel.extension.stage` and `install` with confirmation tokens; snapshots and `extension_versions`; `kernel.extension.uninstall`; rehash before first load and `EXT_INTEGRITY` quarantine; installing the self-contained builtin tarballs on first run, offline; boot steps 4 and 5 (rehash every enabled snapshot, load installed manifests into the registry, ADR 0089). `KVMAN_NPM_REGISTRY` for the bundled pnpm, and a local npm registry (Verdaccio, started by the test harness) for every test that installs from npm; `scripts/pack-builtins` in `pnpm build` (`06` §6.9); `kernel.extensions.list` and `kernel.extension.get` (ADRs 0113–0120: the added dependencies and pnpm 12's executable, installed extensions read from the database with a test install helper, builtins proven with fixture folders and an offline first run, git fetched by the kernel and `dev:` as the folder pipeline, the import-scan rules, stage and install details, the list queries, uninstall before the secrets file; the benchmark baseline re-recorded, ADR 0121).
- **Done when**: a sample extension installs from the local test registry and from a git commit; `pnpm build` produces the builtin tarballs and `digests.json`; a tampered snapshot is quarantined; a `setup` that reads a file or behaves differently on a second run fails in the loader; uninstall keeps or deletes data as chosen (delete also clears its config, `schema_versions` row, notifications, and preset entries); a package with an undeclared import, a missing built `main`, or a top-level native import fails with `EXT_SOURCE_INVALID` naming the cause; first run succeeds with the network disabled.

#### M2.3 Workspaces, enable, config, secrets — 2 days
- **Read**: `07` §7.1 (not preview workspaces), §7.5, `06` §6.4, `04` §4.4, §4.7.
- **Build**: `kernel.workspace.open`, `rename`, `forget`, the Home workspace; the applied-preset row with revisions; `kernel.extension.enable` / `disable` recording grants, `kernel.preset.changed`; namespace exclusivity; `requireTypes` and `EXT_IN_USE`; global-scope routing (`06` §6.4); config resolution, `workspace_config` rows with their own revisions, and `kernel.config.*`; the secrets file and redaction (boot step 3, ADR 0089), removing an uninstalled extension's secrets with `deleteData` (ADR 0120), and the Home workspace at first run; `ctx.config` (writes applied in the unit of work, `04` §4.2), `ctx.secrets`. Forget in the order of `04` §4.4 (stop, cancel and kill, delete in one transaction); secrets applied after commit by atomic file replace (`04` §4.7). Canonical paths with `fs.realpath.native`; workspaces whose folder is missing are marked "folder not found".
- **Done when**: enabling two extensions with one namespace fails `NAMESPACE_CONFLICT`; disabling a required extension fails `EXT_IN_USE` with the dependents; a stale config revision fails `CONFIG_STALE`; secrets never appear in `kernel.config.get`. Forgetting a workspace with a running handler, a deferred command, and a running process cancels all three (the deferred command's `onAbort` runs) and leaves no rows with its id; a failed secrets-file write keeps the old value and logs the failure (its notification is added in M2.12); a config write leaves the applied preset's revision unchanged. Enabling without granting every requested capability fails and lists what is missing; enabling in a workspace with no applied preset fails `PRESET_REQUIRED`.

#### M2.4 Capabilities and isolation — 2.5 days
- **Read**: `05` §5.7, `03` §3.5, §3.8 ("Who" column), `13` §13.6.
- **Build**: requested and derived capabilities; the `Capabilities` grant shape and its validity check against the manifest (`05` §5.7); enforcement on every `ctx` RPC, at commit, and on event delivery; `kernel.subscribers.list` from committed grants; the `tools` capability; admin-only queries; grant-command caller rules; the dedicated worker host; the sandboxed process host with Node permission flags, `--no-experimental-sqlite`, and JSON-lines IPC; hosts keyed by `(extension, isolation)`; idle unload. The read pool serving sandboxed hosts' reads (`04` §4.1).
- **Done when**: the same sample extension runs in all three isolation modes; every `ctx` surface denies without its capability; a sandboxed extension cannot read a file outside its grant or load `node:sqlite`; an unsubscribed foreign event is never delivered. A large `find` from a sandboxed extension does not delay a concurrent `/health` request.

#### M2.5 Blobs, workspace I/O, trust — 2 days
- **Read**: `04` §4.6, `07` §7.2, `12` §12.2 (blobs), `13` §13.7.
- **Build**: the blob store, refs, `keep`/`release`, `z.blobId()` hand-over checked at admission, GC; `PUT /blobs` and `GET /blobs/:id` with the serving policy; `ctx.files` with the realpath jail; trust preview, grant, and revoke with HMAC tokens and the per-read re-check. Pending references for blobs put by running handlers and GC as a single-writer step (`04` §4.6); `blobs.text`, `bytes`, `stream`, `stat`. The trust stat fast path (size, mtime, inode) and gate closing on writes (`07` §7.2); clearing `once` trust at boot (ADR 0089).
- **Done when**: a blob ID without a ref or hand-over is refused; a symlink out of the workspace fails `WORKSPACE_ESCAPE`; changing a trusted file closes the gate; an SVG upload is served as an attachment. A blob put by a handler that runs past the GC grace survives until its commit; a GC run and a put of the same content never leave a reference to a missing file. A write to `.kvman/rules/x.md` through `ctx.files` closes the gate and publishes `kernel.trust.changed {trusted: false}`.

#### M2.6 Processes, local socket, `kv` — 2 days
- **Read**: `03` §3.7, `12` §12.4, §12.6.
- **Build**: the process supervisor (gated start, process groups, capped logs, kill paths including shutdown, `detached` with `onExit`, boot reconciliation, `kernel.processes.list`; `processStart` as in ADR 0088) and its fault points (`14` §14.3); job tokens including `delegate`; the `kernel.sock` adapter; the `kv` shim with `help`. The `kv` shebang pinned to `process.execPath` at every start.
- **Done when**: a killed kernel leaves no orphan process after restart; a token cannot call a type outside its set or any `access: 'user'` type; `kv help` lists only allowed types; a detached process delivers exactly one `onExit` when it exits, when it is killed, and when a kernel restart kills it.

#### M2.7 Reload, versions, migrations, schedules — 2 days
- **Read**: `06` §6.6–§6.7, `04` §4.8, `03` §3.4 (timers), §3.6, §3.9.
- **Build**: extension data migrations with the `extensions.migrating` record, part-way failure, and boot resumption (`04` §4.8, `03` §3.9 step 5); the upgrade boot path that installs newer builtin tarballs and reloads them where enabled (ADR 0089); quarantine reasons and the per-reason unquarantine rule (`03` §3.6); `kernel.extension.reload` with the capability diff and `EXT_GRANTS_REQUIRED`; rollback with `EXT_ROLLBACK_BLOCKED`; `kernel.extension.unquarantine`; declared schedules (`every` and cron). Config migration with `m.config` and config validation at enable and reload (`CONFIG_INVALID`, `04` §4.8). Reload replaces hosts (shared workers that loaded the old version drain and exit); queries during a reload fail `HANDLER_UNAVAILABLE` with `retryAfterMs` while commands wait.
- **Done when**: an upgrade with a migration runs it once; a migration that fails at its first step leaves the old version active; one that fails after a committed step quarantines with `MIGRATION_FAILED` and Retry upgrade resumes it; a daemon killed mid-migration resumes and finishes the swap at boot; an upgrade that requests a new capability fails `EXT_GRANTS_REQUIRED` until reloaded with grants; a schedule fires on time and survives a restart. An upgrade whose config schema rejects a stored value fails `CONFIG_INVALID` listing the field, unless a migration step fixes it. After 20 hot reloads of a shared extension the pool's memory returns to its baseline; a query during a reload is retried by the shell and succeeds.

#### M2.8 Presets lifecycle and preview workspaces — 2 days
- **Read**: `07` §7.1 (preview workspaces), §7.3–§7.4, §7.6.
- **Build**: the catalog with built-in seeding at first run and upgrade (ADR 0089); preset ids and import replacement; import preview and import; apply stage (by id or inline `json`) and apply (stage versions that differ, verify `integrity`, version switches through reload with their cross-workspace preview, validate, commit); integrity recording at install; `kernel.preset.update` with JSON Merge Patch, whole-array replacement, the `extensions` patch limits, and full re-validation; save, `export.get`, delete; catalog events; repo-preset detection; `kernel.workspace.preview.create` (copying the preset and config rows) and its enable rules. Apply writes `workspace_config` rows; save-as and export rebuild `config` from them; a patch with `config` fails `PRESET_INVALID`.
- **Done when**: applying a preset with a missing extension installs and enables it with one confirmation; any failure leaves the previous preset; a stale revision fails `PRESET_STALE`; a preset containing a secret or a `dev:` source is refused on import; a package whose tarball does not match the preset's `integrity` fails `PRESET_INTEGRITY_MISMATCH`; a preset exported from an older kvman applies with the bundled built-ins; applying a preset that pins another version of an extension enabled elsewhere shows that workspace in the preview and switches it after one confirmation; a patch that adds an extension entry fails `PRESET_INVALID`; applying the folder's `preset.json` takes one confirmation; exporting a workspace's preset includes its current config.

#### M2.9 LLM service — 2 days
- **Read**: `05` §5.11, `03` §3.12, `04` §4.1 (LLM tables).
- **Build**: `registerProvider` / `registerModel` recording; derived `provides-llm`; the model registry and `llm_models`; defaults in the preset and `kernel_settings`; `kernel.llm.complete` routed to the provider's host with delta relay; retries; usage rows; `kernel.llm.tokens.count`; the `llmProblem` helper; `fakeProvider` in the testkit.
- **Done when**: a sample provider's deltas arrive as the caller's live events (`live.text` and `live.thinking`); a redelivered caller gets the recorded result without a second provider call; retryable failures back off and succeed; usage rows match calls.

#### M2.10 UI registration and validation — 2.5 days
- **Read**: `05` §5.3 (UI rows), `06` §6.3 (UI rules), `08` §8.4–§8.9, §8.17.
- **Build**: recording of every UI `register*` call; UI validation (slot `accepts`, component `children`, bindings against schemas, component authority, component existence and props, cycles and depth, routes and `ROUTE_CONFLICT`, inactive foreign placements, `requireComponents`, preset references); re-validation of dependents on reload. The view rules of `06` §6.3 (reserved search parameters, palette actions without `$item`, `refreshOn` without live events, dialog depth); entity actions in their three forms (command, navigate, dialog). Entity `route` and the `page` node's `entity`/`record` pair.
- **Done when**: a panel aimed at `frame.sidebar`, a missing component, a public component with its own command, a composite cycle across two extensions, and two pages on one route each fail with a hint; a panel for a disabled extension's slot is inactive with a warning.

#### M2.11 UI registry and localization (kernel) — 2 days
- **Read**: `08` §8.6, §8.16 (kernel parts), `02` §2.10.
- **Build**: `kernel.ui.get`, `kernel.ui.page.get`, `kernel.ui.translations.get` and the `/ui` routes with ETag and `304`; `ext.registerTranslations`; catalog validation (ICU parsing, keys used, parameters); `user_preferences` and `kernel.user.preferences.*`; `context.locale` from the preference; `ctx.locale`, `ctx.i18n.t`; `Problem.params`.
- **Done when**: the registry ETag changes exactly on `kernel.preset.changed`, reload, and quarantine; a missing `$t` key and an invalid ICU message fail validation; a handler three messages down a chain sees the locale of the person who started it. The ETag changes when an enabled extension is quarantined or unquarantined, although the preset did not change.

#### M2.12 Notifications (kernel) — 1.5 days
- **Read**: `08` §8.11, `04` §4.1 (notifications), §4.9.
- **Build**: `ui.*` handling at commit; action-button checks; the `notifications` table with key replacement; rate-limit folding; muting; retention; `kernel.notifications.*`; kernel-generated notifications (quarantine, migration failure, dead letter of a person's correlation, failed secrets-file write); `ctx.ui`; SSE `ui` messages. Notifications that open an entity through its `route`.
- **Done when**: a second `ui.notify` with the same key replaces the first; a button targeting a grant command fails the unit with `CAPABILITY_DENIED`; the 11th notification in a minute is folded; a dead-lettered user action produces a notification with Retry; a failed secrets-file write notifies with the extension and secret name.

#### M2.13 Testkit, prompts, developer docs — 2 days
- **Read**: `05` §5.3, §5.5 (prompt pattern), §5.9–§5.10, `14` §14.5.
- **Build**: the complete `@kvman/testkit` (`createTestKernel`, `asUser({ locale })`, `command`, `query`, event and `ui` recorders, `crashDuring`, `fakeProvider`, fake processes, catalog checks, sandboxed mode for CI); `ext.registerPrompt`; the testkit check for unregistered error codes; `docs/extension-guide.md` with "your first extension in 10 minutes"; `docs/naming.md`; the TypeDoc API reference of `@kvman/sdk` and `@kvman/widget-bridge` in CI (`14` §14.5).
- **Done when**: a sample prompt extension is answered with `asUser()` and rejects `k.command(...)`; its tests pass in shared and sandboxed modes; the guide's examples run in CI; a test whose handler throws an unregistered code fails; a public SDK export without a doc comment fails the build.


#### M2.14 The `kvman` CLI — 2 days
- **Needs**: M2.8, M2.13.
- **Read**: `12` §12.5–§12.6, `07` §7.4, `06` §6.2, `04` §4.10, `03` §3.8 (`kernel.dev.folder.stage`).
- **Build**: `kvman command`, `query`, `events`, `trace`; `kvman ext new/list/install/enable/disable/reload/rollback/uninstall/dev [--watch]/types` (`install` in one step with its preview; `dev` through `kernel.dev.folder.stage`; `new` from the builder's extension template; `types` from `/schema`); `kvman preset list/apply/export/import`; `kvman backup` and `restore`; `--home` and `KVMAN_HOME` on every command; the terminal preview and `y/N` confirmation for grant commands with `--yes`; workspace resolution (`--workspace`, else the deepest opened workspace containing the current directory, else Home); finding the kernel through `daemon.lock`; output and exit codes.
- **Done when**: `kvman command pdf.translate --file-id … --lang ar` in a workspace folder targets that workspace and prints JSON; `kvman ext enable` prints the capability preview and does nothing on `N`; `kvman preset apply` with `--yes` applies in one step; `kvman ext dev ./my-ext --watch` reloads the preview within 2 s of a change; `kvman backup` followed by `kvman restore` into an empty home produces a home that starts and passes `kvman doctor`; `kvman restore` refuses a non-empty home. A project made by `kvman ext new` passes its own test, installs with `kvman ext dev`, and shows its page; `kvman ext install <source>` shows the preview and installs only after `y`; after `kvman ext types`, a `ctx.command` call with a wrong payload for another extension's command fails the type-check.
### M3 — Shell and UI contract

#### M3.1 Shell scaffold, theming, text — 1.5 days
- **Read**: `08` §8.1–§8.2, §8.16 (right-to-left, formatting), §8.18–§8.20.
- **Build**: the Vue app and Vite build served by the kernel's static adapter with the shell CSP; design tokens for light and dark; bundled fonts; `<html lang dir>`; the logical-CSS lint rule; the `kvman:` catalogs (`en`, `ar`) with `intl-messageformat`; the `t()` helper with the fallback chain; `Intl` formatters for every `Format`. Accent contrast adjustment (`08` §8.18).
- **Done when**: a physical CSS class fails the build; every `Format` renders the examples of `08` §8.16 in `en` and `ar`.

#### M3.2 Data layer — 2.5 days
- **Read**: `08` §8.14, `12` §12.2–§12.3, §12.9.
- **Build**: the HTTP client (idempotency keys, stream and client headers); the `SharedWorker` stream holder and the Web Lock leader fallback; subscription deduplication; resume and `resync`; the query cache with `refreshOn`; live-event subscriptions (`<type>:<key>`, runs, resets per run, and gaps); command sending with `200`/`202` and late replies; pending state keyed by idempotency key; preferences load and live switch. Fallback for an unknown `?ws=` and the missing-folder notice (`08` §8.14).
- **Done when** (Playwright): 8 tabs share one stream; closing the leader tab hands over; a kernel restart resumes all tabs; an event that arrives before its POST response is handled. A shell built for another `protocolVersion` shows the recovery page instead of the app (`12` §12.9).

#### M3.3 Frame and shell-only zones — 2.5 days
- **Read**: `08` §8.3, §8.17, `07` §7.1 (switcher).
- **Build**: the frame with its slots (top bar, sidebar with groups, separators, and modes, status bar, main with routing and the side pane, overlay); responsive rules; the shell-only zones (brand, workspace switcher, connection, kvman menu, risk banner, palette, shortcuts modal; the tray and toasts come in M3.8); registry fetch and refresh; the recovery page; the offline screen.
- **Done when**: a fixture registry renders every region in order with overflow; `layout.sidebar: 'hidden'` hides it; the recovery page works with every extension disabled.

#### M3.4 Renderer core and display components — 2.5 days
- **Read**: `08` §8.5, §8.7, §8.8 (layout and display), §8.19.
- **Build**: the view renderer with props validation against specs and inline error boxes; the binding resolver and interpolation; conditions; per-owner `$t` resolution and `<bdi>`; actions (command with confirm, form, busy, then; navigate with pane; dialogs; set) and effects; declared queries; the layout and display components; the Markdown sanitizer with Shiki class output; left-to-right islands.
- **Done when**: every layout and display component passes its spec examples; the Markdown XSS matrix of `13` §13.8 passes; a broken node shows an error box while the rest renders.

#### M3.5 Data and input components, forms — 2.5 days
- **Read**: `08` §8.8 (data, input, action), §8.12.
- **Build**: `table` (virtualized, columns, `rowActions`, selection, `Intl.Collator` sorting), `list`, `thread` (renderer target, live text and thinking), `form` from schemas (labels from `.meta`, overrides, issue mapping), every input, `upload` (blob PUT then `onUpload`), `composer` (slash menu from a query with `fill`, sending the chosen slash command or opening its form, attachments, optimistic), `button`, `menu`, `actionGroup`.
- **Done when**: every component passes its spec examples; a form maps kernel validation issues to its fields in the current language; a 5,000-row table scrolls at 60 fps on the reference machine; a slash command chosen in the composer is sent with its `arg` and `fill` values, or opens its form when required fields remain.

#### M3.6 Contributions — 2 days
- **Read**: `08` §8.4–§8.6, §8.10, §8.17.
- **Build**: pages by route in both panes; nav groups, items, and badges; toolbar items (button, menu, badge, overflow); status items; panels in `frame.overlay` with the stepper and in extension slots (`slot` node, `$slot`, `stack` / `row` / `tabs` layouts, `max`); entity actions in rows, detail headers, and the palette; renderers; "Show hidden pages". Detail-page entity actions from `page.entity`/`record`; palette actions that need no record.
- **Done when**: every contribution kind of a fixture extension appears in the right place; hiding a page hides its nav item; a panel with `visibleIf` over a live query appears and disappears without a reload. A fixture detail page (a `page` node with `entity` and `record`) shows its entity's `detail` actions without writing them in the page.

#### M3.7 Extension components and widgets — 2 days
- **Read**: `08` §8.9, §8.15.
- **Build**: composite rendering (`$props`, `z.action()` props, `children`); public components across extensions with per-owner text; the kernel's widget-origin adapter; the iframe sandbox and widget CSP; `@kvman/widget-bridge`.
- **Done when**: the acme-ui example of `08` §8.9 renders inside pdf's page with pdf's action; a widget cannot reach the parent DOM, another extension's types, or the network.

#### M3.8 Notifications, grant dialog, prompts, first run — 2.5 days
- **Read**: `08` §8.11, §8.13, §8.3 (first-run).
- **Build**: the toast stack; the tray (list, read, dismiss, mute, attention pinning); opt-in desktop alerts; automatic error toasts; the grant dialog for every `GrantCommand` with data fetched from the kernel and bidi stripping; `openGrantDialog`; the first-run flow; a prompt panel in `frame.overlay` answered end to end.
- **Done when**: a view that targets a grant command directly fails validation, while its `openGrantDialog` opens the dialog; a prompt answered in one tab shows "already answered" in the other; a notification replaced by key shows once; first run applies a fixture built-in preset through the dialog (the real built-in presets arrive in M5.5).

#### M3.9 Right-to-left and language pass — 1 day
- **Read**: `08` §8.16.
- **Build**: checks of the mirrored frame, flipped directional icons, and left-to-right islands; screenshot tests of every shell screen in `ltr` and `rtl`; the live language switch in all tabs.
- **Done when**: screenshot baselines exist for both directions; switching language in one tab re-renders all tabs without a reload and keeps form values; no URL ever contains the language (switching changes no URL, and a copied link opens in the saved language); after a restart the shell opens in the saved language.

#### M3.10 PDF example and view-language docs — 2 days
- **Read**: `05` §5.2, `08` §8.21–§8.22.
- **Build**: `examples/pdf-translator` with every registration of `05` §5.2, the viewer widget, `en` and `ar` catalogs, and tests against `fakeProvider`; `docs/view-language.md`. One test per row of the edge-case table `08` §8.22 (rows owned by earlier milestones are linked, not repeated).
- **Done when**: upload, table, the Translate action with its generated form, streamed progress, the `pdf.fileCard` composite, the detail page with the viewer widget, and the tray notification all work end to end in Arabic right-to-left and in English. Every row of `08` §8.22 has a passing test.

### M4 — Agent pack

#### M4.1 `llm-providers` — 2.5 days
- **Needs**: M2.
- **Read**: `10` §10.1, `05` §5.11.
- **Build**: pi-ai providers with `registerProvider` / `registerModel`; OpenAI-compatible endpoints through `listModels`; error mapping to `LLM_*`; config and secrets; the provider panel for `settings.providers`; OAuth logins with the prompt pattern; `en` and `ar` catalogs.
- **Done when**: an API-key provider completes and streams against a recorded HTTP fixture; a rate-limit response is retried with `retryAfterMs`; a pending login appears as a panel and is completed by `llm-providers.login.finish` from a user.

#### M4.2 Agent sessions, turns, prompt sections — 3.5 days
- **Read**: `09` §9.1–§9.4, §9.6 (prompt order and sections), §9.8, §9.10, `10` (intro).
- **Build**: the data model; session commands; `agent.send` → `agent.step` → assistant entry, without tools; token and thinking live events; steering; cancel (`stepMessageId`, running calls); turn deadlines; retention. `agent.inject` starting a turn when idle; new turns for entries sent while cancelling; delete cancelling first; retention skipping busy sessions. `agent.chat.start`; the handler timeouts of `09` §9.2. Prompt sections (`agent.prompt.section.set` / `.remove`, `agent.prompt.sections.list`, their limits, removal on `kernel.extension.disabled`) and `agent.activated`; prompt assembly with sections in order and the language line.
- **Done when**: a scripted `fakeProvider` conversation produces the expected history; a message sent mid-turn is answered in the next step; cancel stops the LLM call; a crash mid-step produces one assistant entry after restart; `agent.send` from an extension fails `CALLER_NOT_ALLOWED`. An injected job result starts a turn in an idle session; a message typed during a cancel is answered after it; deleting a running session cancels its turn first. `agent.chat.start` creates a session and answers its first message; an LLM call that streams for 3 minutes completes. Sections appear in `order`, then owner, then id; an extension cannot change another's section; limits fail `agent/SECTION_LIMIT`; a section owner enabled before the agent registers after `agent.activated`; disabling an owner removes its sections from the next prompt.

#### M4.3 Tools, guards, `shell` — 4 days
- **Read**: `09` §9.2–§9.5, `10` §10.2.
- **Build**: tool discovery through the schema (commands and queries); query tools run inline and command tools through continuations; the `tools` capability; `bash` and `direct` modes; `ToolCallState` in turn state; guards (guard extensions detected with `kernel.subscribers.list`, `agent.guards.set` replacing the sender's set, the fail-closed `'<ns>'` placeholder, covering, `agent.tool.call.created`, `agent.tool.call.review`, `agent.tool.review.release` on registration and on `kernel.extension.disabled`, `agent.reviews.list`); the approval panel and `agent.approval.answer` for uncovered dangerous tools; `agent.tool.call.completed`; result truncation; the `shell` extension (sync exec inside a non-retry-safe step with `shell/TIMEOUT`, async exec with `detached` + `onExit` and `shell.job.finish`, jobs, kill, logs, `shell.output.written`, `agent.inject`, delegated tokens with `allowTypes`). ADMIT's tool-name and argument checks; `direct`-mode name mapping with the 64-character rule.
- **Done when**: in bash mode the model's `kv fs.file.get …` works only for enabled tools; with no guard a normal tool runs at once and a dangerous one waits for `agent.approval.answer` from a user and refuses it from an extension; with two test guards a call runs only after both allow, and one deny ends it with `agent/TOOL_DENIED` naming the guard; a review from an extension that is not a covering guard fails `agent/REVIEW_REJECTED`; a guard extension enabled together with the agent (same preset apply) holds every call until it registers, so no call runs unguarded; an audit extension that only subscribes never blocks; disabling a guard, or registering `[]`, while a call waits releases it; a guard that asks the person first (prompt pattern) delays the call until the answer; `agent.tool.call.completed` is published for every outcome; an async job's result is injected into the session. A hallucinated tool name and invalid arguments return tool errors without any guard event; a 70-character type maps to a valid provider tool name and back; a query tool runs inline after its guards allow it and its result is in history in the same step. A sync command running longer than 60 s completes; a kernel crash during a sync command reports `EFFECT_INDETERMINATE` and never runs it twice.

#### M4.4 `fs`, `todo`, `interviewer`, `local-guard` — 2.5 days
- **Read**: `10` §10.3–§10.5, §10.11.
- **Build**: the four extensions with their tools (the `fs` read tools as queries), prompt sections, subscriptions, and catalogs; the interviewer's question panel and its attention notification; `local-guard`'s guard and prompt.
- **Done when**: `fs.edit` fails on multiple matches without `replaceAll`; `fs.file.get` of a missing path fails `fs/NOT_FOUND`; todos are copied on fork; an interviewer question survives a kernel restart and is answered after it. With `agent`, `shell`, and `local-guard` enabled in a testkit workspace, `curl http://127.0.0.1:<port>/api/v1/commands/<type> …` waits until a user sends `local-guard.question.answer`, while `ls` runs at once.

#### M4.5 Rules, skills, persona, preflight, compaction — 2.5 days
- **Read**: `09` §9.6 (preflight), §9.7, `10` §10.6.
- **Build**: `rules`, `skills`, `persona` with their sections and refresh triggers; preflight with `countTokens`; in-place compaction with its budget, timeout, `agent/COMPACT_FAILED` notice, and divider.
- **Done when**: an edited rule file reaches the prompt by the next turn; untrusted rules are skipped with a notice; a history over the limit is compacted once and the turn continues; a failed compaction leaves history unchanged with a warning.

#### M4.6 Subagents, chat UI, Coding Agent acceptance — 4 days
- **Needs**: M4.5 and M3.8.
- **Read**: `09` §9.9, §9.11–§9.12.
- **Build**: `agent.child.run` with depth (`agent/DEPTH_EXCEEDED`), budget, and allowlist; the `/chat` composer with `agent.chat.start` and the thread composer with slash `fill`; fork, close, delete; the chat pages, slots, header toolbar, status item, entity actions, renderers, and slash commands (`agent.slash.list` from `slash` metadata, `05` §5.5, `09` §9.11); `en` and `ar` catalogs. `context.rootSessionId`; child approvals, guard waits, and questions shown in the root session.
- **Done when**: the Coding Agent acceptance checklist passes: chat with streaming, bash tool with jobs and logs, async results injected, fs tools, todos, interviewer questions and tool approvals across a restart and answered from a second tab, a guard-reviewed tool call, rules and skills after trust, compaction, subagents with and without a shell, cancel, and steering; crash-mid-turn scenarios show no duplicate or lost entries, and the thread shows a crashed step's text once. A dangerous tool in a subagent is approved from the root thread; a subagent's interviewer question appears in the root thread.

### M5 — Platform pack and presets

#### M5.1 `settings` — 2 days
- **Read**: `10` §10.7.
- **Build**: `settings.general` with one section per enabled extension (generated forms, both scopes, masked secrets with Clear, revision-aware saves) and `settings.models` with providers, models, defaults, usage, and the `settings.providers` slot.
- **Done when**: a stale save shows the reload prompt; setting a default model changes the model a new chat uses; the pages are fully translated in Arabic.

#### M5.2 `extensions` — 2 days
- **Read**: `10` §10.9, `06` §6.10.
- **Build**: the list and detail pages; the install dialog; enable through the grant dialog; isolation changes; "needs approval" upgrades; rollback; uninstall.
- **Done when**: installing from npm and enabling in a workspace takes exactly one grant-dialog confirmation; an upgrade with a new capability shows "needs approval" until approved.

#### M5.3 `presets` and low-code pages — 3 days
- **Read**: `10` §10.8, `07` §7.3–§7.4, `08` §8.17.
- **Build**: the catalog page (import, apply, save as, export) and the editor (layout, order with separators, hidden items, per-language labels, app settings, catalogs, config, low-code pages, nav groups, and nav items, with live `kernel.validate` and preview).
- **Done when**: a preset-only page is created in the editor without code and appears in the sidebar; stale edits are rejected; the apply dialog lists what the preset hides.

#### M5.4 `inspector` — 1.5 days
- **Read**: `10` §10.10, `13` §13.4–§13.5.
- **Build**: the traces, dead letters (retry, discard), live traffic, and processes pages.
- **Done when**: a trace of a chat turn shows its full causation tree; retrying a dead letter re-runs it.

#### M5.5 Built-in presets and the PDF Translator app — 1.5 days
- **Read**: `07` §7.6, `08` §8.3 (first-run).
- **Build**: the Coding Agent, Assistant, and Minimal presets; the PDF Translator preset for `examples/pdf-translator` with a real provider from `llm-providers` (the example installs from the local test registry until M7.3 publishes it).
- **Done when**: a non-technical flow works: pick "PDF Translator" → one confirmation installs and enables everything → translate a file; trust change detection works for a repo preset.

### M6 — Self-extension

#### M6.1 `builder` core and dev-project kernel commands — 4 days
- **Read**: `11` §11.4–§11.6, `03` §3.5, §3.8 (`kernel.dev.*`), `05` §5.10.
- **Build**: `@kvman/devtools` (TypeScript, esbuild, and the build scripts); `kernel.dev.project.*`, `kernel.dev.file.*` and `kernel.dev.files.list` jailed to the project, and `kernel.dev.build` in its three stages (compile without project code, record in the loader, tests in the sandboxed test process; record a `dev:` version); the testkit's remote mode; the dev-project import policy; dev projects from templates (with a passing `node:test` test and an `en` catalog); `builder.project.create`, `builder.file.*`, `builder.dir.list`, `builder.check`, `builder.test`.
- **Done when**: a file path outside the project is refused with `WORKSPACE_ESCAPE`; a broken project returns issues with hints; an import of an npm package fails with a hint to export and publish; tests run in the sandboxed test process and report results; a test that writes a file, starts a process, or loads `node:sqlite` fails there; a project `tsconfig.json` cannot loosen the compiler options; a clean build records `dev:<project>@<n>` whose snapshot contains `dist/extension.js` and installs through the normal pipeline without network.

#### M6.2 Preview workspace and pane — 2 days
- **Read**: `11` §11.7, `07` §7.1.
- **Build**: `builder.preview.start/stop` using preview workspaces; the embedded shell pane (`?ws=…&embed=1`, never stored as the last-used workspace); seed data; the plan card's "cannot be tried in the preview" note for `process` and `network`.
- **Done when**: a dev version runs in the preview with its own data; the user's workspace data is unchanged; a new version hot-reloads in about a second.

#### M6.3 Builder UI, preset, and knowledge tools — 3.5 days
- **Read**: `11` §11.1–§11.4, §11.9.
- **Build**: plan and publish cards in `agent.chat.prompt` and `frame.overlay`; `builder.approval.answer`; the Extension Builder preset (fs read tools only) with the builder's prompt sections; `docs/llms.txt`; the knowledge tools `builder.schema.search` and `builder.docs.get` (queries); the remaining examples of `11` §11.9.
- **Done when**: the Builder proposes a plan, waits for approval from a user, and generates catalogs for `en` and the user's language.

#### M6.4 Publish and rollback — 2.5 days
- **Read**: `11` §11.8, §11.10, `06` §6.6–§6.7, `12` §12.5 (`ext pack`).
- **Build**: the publish flow for new extensions and new versions (grant dialog when capabilities grow; otherwise `builder.approval.answer`, then the builder's `kernel.extension.reload`) and for preset patches; rollback; cleanup of never-enabled versions; `kvman ext pack` (an npm-publishable tarball from a builder project).
- **Done when**: publishing a tier ② extension takes one grant-dialog confirmation; rollback restores the previous version; a cancelled publish leaves nothing enabled; `kvman ext pack` produces a tarball that installs from the local test registry. Each guardrail row of `11` §11.10 has a test.

#### M6.5 Evaluation set — 2 days
- **Read**: `11` §11.11.
- **Build**: `milestones/M6.5-TEST-CASES.md` with the 10 app requests and a runner.
- **Done when**: ≥7 of 10 reach publish without the user touching code, and 10 of 10 either succeed or fail with a clear explanation and no side effects.

### M7 — Hardening and release

#### M7.1 Security matrix — 2.5 days
- **Read**: `13` §13.6–§13.8.
- **Build**: every test of `13` §13.8 not yet present.
- **Done when**: the full matrix passes in CI.

#### M7.2 Soak, upgrades, performance — 4 days
- **Read**: `14` §14.3, §14.6, `04` §4.8.
- **Build**: a multi-hour fault-injection soak; upgrade tests from a database written by each earlier phase's build; migration and rollback tests; performance and memory tuning.
- **Done when**: the soak passes the invariants; every upgrade path opens and migrates; every target of `14` §14.6 is met.

#### M7.3 Packaging and release — 3.5 days
- **Read**: `14` §14.5, §14.7, `12` §12.5.
- **Build**: `npm i -g kvman` (kernel with bundled pnpm, shell, self-contained builtin tarballs with their digest list, packed by `pnpm build`); `examples/pdf-translator` published to npm as `@kvman/example-pdf-translator` with the release, its preset pinning that version's `integrity`; `kvman start --open`; `kvman doctor`; a documentation pass; the dependency refresh.
- **Done when**: on a clean machine, a fresh install reaches a working chat in under 5 minutes, and the PDF Translator preset in under 5 minutes; all gates are green.

## 15.5 Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | SQLite single writer limits throughput | slow under heavy load | group commit, batching benchmarks in M1.9, storage-thread fallback behind the same interface |
| R2 | `better-sqlite3` is a native addon | install or packaging failures on some platforms | prebuilt binaries for Node 24 on Linux/macOS/Windows checked in CI; driver interface allows switching to `node:sqlite` |
| R3 | Shared pool blast radius (a runaway handler kills co-located work) | redeliveries, latency spikes | deadlines + stuck detection, collateral redelivery without penalty, quarantine, dedicated/sandboxed modes |
| R4 | Step-chain agent is harder to reason about than a loop | bugs in turn state | the turn state machine as a pure module inside `agent` with fast-check model tests (`09`, intro); fault injection on every step boundary |
| R5 | View language too limited → overuse of widgets | inconsistent UI | composite components cover most custom UI without code; track widget usage in examples and the builder eval set; grow built-in components in shell releases |
| R6 | Node 24 permission model cannot restrict network | a sandboxed extension can still make network calls | disclosed in the UI and docs (R-Q2); runtime probe enables enforcement automatically on a supporting Node; sandboxed hosts receive no secrets other than their own |
| R7 | Builder output quality | frustrating user experience | lowest-tier-first ladder, strict validation with hints, templates with passing tests, evaluation set as a gate |
| R8 | Scope: 15 core extensions (agent pack 10, platform pack 4, `builder`) + kernel (with the LLM service) + shell + builder toolchain | schedule overrun | platform pack kept thin; builder last; cut list (§15.6) |
| R9 | SSE resume, backpressure, and multi-tab sharing edge cases (lost subscriptions, leader handover, events before POST responses) | stale or missing UI data; stalled requests with many tabs | `Last-Event-ID` resume with `since` re-subscription, `resync` fallback, one stream per browser, pending state keyed by idempotency key, e2e tests for reconnect, kernel restart, and 8+ tabs |
| R10 | Prompt injection via documents or tool output | unwanted actions | approvals, answers, and every grant are `access: 'user'` commands enforced by the kernel; guards that review every tool call they cover (`09` §9.5) and the agent's own approval for uncovered dangerous tools; `local-guard` asks before shell commands that reach kvman (`10` §10.11); `agent.send` is user-only; capabilities cannot be self-granted; an obfuscated shell command can still reach the HTTP API (disclosed, `13` §13.6) |
| R11 | kvman writes into a folder that holds other data (e.g. a mistyped `--home`) | mixed or lost files | start refuses a home folder with other files and no `kvman.db` (`HOME_INVALID`, `00` R-Q4) |
| R12 | Sandboxed by default costs memory and startup time for third-party extensions | slower first message, higher RAM with many extensions | idle unload after 10 min, lazy start, one process per active extension only, measured in M2.4; users can grant lower isolation |
| R13 | Kernel LLM service widens the kernel | kernel churn when providers change | the kernel holds only the registry, routing, and usage; all provider code and SDKs live in extensions behind a fixed protocol schema |
| R14 | Right-to-left and translation regressions (a physical CSS class, a literal string, a broken plural) | broken Arabic layout or mixed languages | right-to-left built from M3.1, lint rule on physical CSS, catalog checks in CI, e2e screenshots in both directions, literal-string warnings (errors for builder output) |
| R15 | Storage sorts text by raw byte order | wrong alphabetical order for Arabic and accented names in large lists | sort loaded rows with `Intl.Collator` in the shell; queries that need locale order return a sort key; ICU collation in SQLite is in the post-v2 backlog |
| R16 | Public components become APIs that other extensions depend on | an upgrade of a UI-kit extension breaks others | dependents' views are re-validated against the new props on reload; failures block the upgrade with a list; private is the default |
| R17 | A guard or prompt-section owner misbehaves (never reviews, registers too broadly, pushes stale or huge sections) | tool calls wait until the turn deadline; a noisy or outdated prompt | waits are visible ("Waiting for <guard>") and the person can cancel or disable the guard; section size and count limits; `agent.prompt.sections.list` shows exactly what the model is told; disabling an extension removes its guards and sections |
| R18 | The builder toolchain (`@kvman/devtools`: TypeScript, esbuild) enlarges the install and the memory of builds | slower install; memory spikes while building | started only by `kernel.dev.build`, as child processes that exit after each build; install size measured in M7.3 |
| R19 | Node's permission model has gaps besides network (it does not cover `node:sqlite`; a later Node may add others) | a sandboxed extension reads or writes files it was not granted, including `kvman.db` | sandboxed processes start with `--no-experimental-sqlite`; the M0.5 permission probe runs in CI and fails on every bypass it knows; builder test code runs with no write access and no addons (`11` §11.5) |

## 15.6 Cut list (if the schedule slips, in this order)

1. `inspector` live traffic page (keep traces and dead letters).
2. Split panes in the shell (a side-pane request opens in the main pane instead).
3. OAuth logins in `llm-providers` (keep API-key providers and OpenAI-compatible endpoints).
4. `schedules` cron syntax (keep `every`).
5. Builder tier ③ (widgets) — builder produces tiers ① and ② only.
6. `kvman ext dev --watch` (keep the one-shot `kvman ext dev`).

Never cut: unit-of-work atomicity, fault-injection invariants, capability enforcement, `access` checks, fail-closed guards and `local-guard`, trust gate, rendering security, recovery page, right-to-left layout.

## 15.7 Post-v2 backlog

| Item | Why it waits |
|---|---|
| `@kvman/agent-kit` (step-machine helpers for alternative agents) | the `agent@1` contract is enough to write one; shared helpers come once a second agent exists |
| Trusted native shell components | wait for real extensions that need them |
| Non-JS actors over stdio | protocol is ready; needs a host type and SDKs |
| Multiple users, remote access, authentication | addresses are ready; needs an auth model and per-user grants |
| Network enforcement on Node 24 | depends on Node's permission model; automatic when available |
| More languages and language packs | v2 ships `en` and `ar`; other languages need shell catalogs, and could later come as extensions |
| Translation coverage dashboard | validation already reports missing keys; a per-extension coverage view is polish |
| Locale-aware collation in storage | see R15 |
| `kvman start --unsafe-bind` | a non-loopback bind needs a decision on which `Host` values it accepts (ADR 0097) |
