# kvman

kvman is a local **actor runtime with a UI shell**: a small kernel delivers typed messages between actors (extensions, people, processes) and commits their effects atomically. Every feature, including the AI agent, is an extension. The specification is in [`plan/`](plan/README.md); working rules are in [`CLAUDE.md`](CLAUDE.md).

## Status

| Milestone | State | What works |
|---|---|---|
| M0.1 Monorepo scaffold | done | pnpm workspace with Turborepo; the eight packages of `plan/01` §1.5 with empty entry points; strict TypeScript; ESLint with the import walls and the 300-line cap; Vitest; Playwright installed; changesets; the ADR template |
| M0.2 Protocol: messaging core | done | `@kvman/protocol`: Zod schemas for addresses, the message envelope, kinds, delivery classes, `access`, live chunks, replies, problems and issues, the HTTP request bodies; the kernel error catalog; canonical JSON and SHA-256 digests (Web Crypto); the naming-grammar checker with fix hints; the filter language and its evaluator. A repository test checks that every milestone scenario has exactly one test |
| M0.3 Protocol: extensions, presets, LLM | done | `@kvman/protocol`: the manifest schema (`plan/05` §5.12) with lane templates, function references, and capability requests; the `Capabilities` grant; the source grammar and integrity rules; the `Preset` schema and the preset secret check; config field meta; translation catalogs; blob ids; the LLM request, result, message, and model shapes; the extension stage result. UI definitions inside manifests and presets are checked for ids and descriptions; M0.4 adds their full shapes |
| M0.4 Protocol: UI contract | done | `@kvman/protocol`: the binding-path parser, conditions, and the view-language base types; actions and effects; a spec with props, events, children rules, and an example for each of the 45 built-in components; a structural view validator (props, children, parents, child counts, bindings) with exact issue paths; every contribution shape, composites, and widgets, now used by manifests and presets; the frame slot catalog; the UI registry; toasts and notifications; SSE messages; the schema-endpoint document |
| M0.5 Spikes and ADRs | done | ADR 0001 measures `better-sqlite3` (about 2,000 single commits/s, about 41,000 units/s with group commit, fast read-only workers); ADR 0002 records what Node 24's permission model denies; ADR 0003 pins `@earendil-works/pi-ai@0.87.1`; ADR 0004 validates the builder toolchain and the sandboxed `node:test` process. The permission probe (`packages/kernel/scripts/permission-probe.ts`) runs in `pnpm test` |
| M1.1 Storage engine | done | `@kvman/kernel`: a storage driver interface with the `better-sqlite3` adapter; opening `kvman.db` private (0600) in WAL mode with the pragmas of `plan/04` §4.1; the kernel migration runner and the full kernel schema; `SCHEMA_TOO_NEW` for a newer database without writing data; the commit pipeline (group commit of up to 64 units or 2 ms, one savepoint per unit, version checks with `STORAGE_CONFLICT` per unit, unit limits, the failed-send-with-`onReply` rule); the read-only connection factory; ULIDs |
| M1.2 Store API and step journal | done | `ctx.store` implemented in the kernel against the SDK's `Store` interface: kv, collections (declared indexes as partial expression indexes; `find`/`count` with the filter language compiled to SQL that matches the protocol evaluator; `patch` as a JSON Merge Patch; caps with `STORE_RESULT_TOO_LARGE`), logs, and global scope; read-your-writes over the pending unit; automatic version tracking; the step journal with `EFFECT_INDETERMINATE` and `STEP_DUPLICATE`. Vitest now resolves workspace packages to their sources |
| M1.3 SDK core and registry | done | `defineExtension(meta, setup)` and `z` (Zod plus `blobId`, `text`, `action`) in `@kvman/sdk`; the kernel records `setup` with its own `ext` into a manifest (defaults written out, schemas as JSON Schema, functions by reference), runs it twice for determinism, closes `ext` afterwards, and reports every mistake at once as `EXT_MANIFEST_INVALID` with manifest paths and hints (namespaces, name sets, migration steps); typed references are branded names; the kernel registry resolves a type per workspace and an event's subscribers. `pnpm vitest run packages/testkit` records the pdf example against the M0.3 fixture |
| M1.4 Router and admission | done | `@kvman/kernel`'s router admits commands, queries, and events (`plan/03` §3.3 steps 1–7): envelope checks, ids, correlation, context and locale inheritance, priority defaults and lowering, `notBefore`; registry resolution; capability checks against a grants source and `access` checks for people, extensions, processes, and the kernel; payloads validated with Ajv against the manifest schemas; lane templates rendered; idempotency with request digests (a repeated key returns the original message and reply); durable events logged and delivered once per granted subscription. People's commands commit through the adapter path, handlers' sends and publishes inside their unit, and committed messages feed the pending index (lane queues, keyless queues, timer wheel), rebuildable from SQLite. `pnpm vitest run packages/kernel/test/router` |
| M1.5 Scheduler | done | `@kvman/kernel`'s scheduler (`plan/03` §3.4) picks pending messages by class (`background` counts as `normal` after 30 s runnable), then round-robin across workspaces (and one slot for messages without one), then across lanes and handler queues; runs one message per lane in order; enforces handler `concurrency` (16), extension concurrency (64), and each host's cap with a quarter kept for queries, which skip lanes and command limits; claims rows as `running` and hands them to a dispatcher interface (hosts arrive in M1.6); fires `delayMs`/`at` timers; retries failed attempts after 1 s, 5 s, 30 s up to `maxAttempts` (3) and reruns storage conflicts at once five times; stores `MESSAGE_DEAD` and publishes `kernel.message.dead-lettered`; keeps a retrying message's lane; and detects `LANE_REENTRANT` for M1.6's `ctx.command`. A handler's declared `priority` is the default request. `pnpm vitest run packages/kernel/test/scheduler` |

Milestones follow `plan/15-phases-risks.md` §15.4. Each one's scenarios are in [`milestones/`](milestones/).

## Requirements

- Node 24 LTS
- pnpm 12.6.0 (pinned in `package.json`; `corepack pnpm` or any pnpm that switches to the pinned version)

## Commands

```sh
pnpm install
pnpm typecheck     # tsc for every package (sources resolved through the @kvman/source condition) and the repository tests
pnpm lint          # ESLint with zero warnings allowed: import walls, max 300 lines per source file, code rules
pnpm test          # Vitest: every test in the repository (and a check that each milestone scenario has exactly one test)
pnpm build         # tsc builds every package into dist/, in dependency order
pnpm bench:check   # benchmark regression gate; prints "no baseline yet" until M1.9
node packages/kernel/scripts/permission-probe.ts   # the sandbox probe on its own: prints its report, exits 1 on any bypass
```

A milestone is done when all five pass: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check`. There is no CI for now (ADR 0007); the gates run locally.

## Layout

```
packages/     protocol · sdk · kernel · testkit · shell · widget-bridge · cli · devtools
eslint/       the import-walls rule (plan/01 §1.5)
test/         repository-level tests (tooling) and their fixtures
milestones/   <id>-TEST-CASES.md for each milestone
plan/         the specification; plan/adr/ holds the decisions taken while building
```

## Decisions

Answers to questions the plan left open are ADRs in [`plan/adr/`](plan/adr/): the SQLite driver's measurements (0001), the permission probe (0002), the pi-ai package (0003), the builder toolchain (0004), TypeScript held at 6.x (0005), `typescript-eslint` and `@types/node` 24 (0006), CI deferred (0007), filter-language semantics (0008), SHA-256 through Web Crypto (0009), exact naming-grammar checks (0010), `Issue.severity` and `Problem.retryAfterMs` (0011), dev-project reads as queries (0012), manifest recording rules (0013), LLM messages and tool calls (0014), the stage result (0015), durations, private names, lane templates, and naming exceptions (0016), the preset secret check (0017), blob ids (0018), preset integrity for dev and local sources (0019), test tools in package tests (0020), public npm access (0021), kernel error titles in the plan (0022), `z.text()`/`z.action()` in JSON Schema (0023), component `parents` (0024), frame slots and component rules in `/schema` (0025), the binding grammar (0026), the SSE event shape (0027), `muted` text (0028), `childCount` and input controls (0029), an integer `protocolVersion` (0030), unit-of-work writes (0031), priority codes, busy timeout, and unit limits (0032), `@types/better-sqlite3` (0033), rows of failed sends and denied dependency builds (0034), `SCHEMA_TOO_NEW` writing no data (0035), `find` ordering (0036), `patch` as a merge patch (0037), indexed finds (0038), oversize values (0039), the store without a workspace (0040), the kernel implementing `ext` (0041), collected registration issues (0042), `z` and Zod in the SDK (0043), typed references as branded names (0044), the registry's scope (0045), contiguous migrations (0046), JSON Schema conversion in protocol (0047), messages and events without a workspace (0048), shared test fixtures (0049), `Ctx` and `MigrationContext` growing with the milestones (0050), what admission assigns in M1.4 (0051), capability checks with grants as data (0052), event delivery rows and unit publishes (0053), caller lanes and kernel context keys (0054), inline payloads until the blob store (0055), the Ajv configuration (0056), a mismatched key with `onReply` (0057), admission details (0058), attempts and the backoff ladder (0059), the scheduler's host interface (0060), kernel types in the registry (0061), stored dead replies (0062), lanes held by running messages (0063), aging and fairness (0064), and a handler's declared priority (0065).
