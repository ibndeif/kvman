# kvman — rules for working in this repository

kvman is a production application: a local **actor runtime with a UI shell**. A small kernel delivers typed messages between actors (extensions, people, processes) and commits their effects atomically. Every feature, including the AI agent, is an extension, and the community will build extensions on the public SDK. It is a new application: there is no earlier version to stay compatible with.

The specification is `plan/`. Read `plan/00-decisions.md`, `plan/README.md`, and `plan/01-architecture.md` once, in full, before any work. `plan/00` wins over every other file. Names, shapes, error codes, defaults, and limits in the plan are exact.

## 1. Ask, don't assume

- If the plan does not specify something that affects behavior, a public shape (schema, message type, SDK call, error code, route), a dependency, security, or stored data: **stop and ask the product owner.** Never invent an answer, never pick "a reasonable default" silently.
- If two plan sections seem to disagree, or the plan looks wrong: stop and ask. Do not resolve it in code.
- Record every answer as an ADR in `plan/adr/` (template `plan/adr/0000-template.md`) and correct the plan text before the code lands.
- Only private names and the internal layout inside a package are yours to choose.

## 2. How to work: milestone by milestone

Milestones are in `plan/15-phases-risks.md` §15.4 (M0.1 … M7.3). Do them strictly in order, one at a time (the only allowed overlap is in §15.3). For each milestone:

1. **Read** every section in its *Read* list. Ask about anything unclear now.
2. **Write the scenarios** in `milestones/<id>-TEST-CASES.md` before any code, in two sections:
   - **Happy path**: one Given/When/Then scenario per *Done when* bullet.
   - **Edge cases**: every failure, limit, race, crash point, and error code the read sections name.
   Each scenario has an id (`M2.4-H3`, `M2.4-E7`) and names the test file it will live in.
3. **Implement** exactly the *Build* list. Nothing from a later milestone. You must swich to be an expert the will implement this milestone.
4. **Write the tests** that match the scenarios one to one, each named with its scenario id. No scenario without a test and no test without a scenario. A scenario discovered while implementing is added to the file first (and asked about first if the plan does not cover the behavior).
5. **Pass everything**: every test in the repository, not only the new ones, and the gates:
   `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check`
6. **Record** in the root `README.md` what now works and how to run it. Only then start the next milestone.

A milestone is done only when every *Done when* bullet is proven by an automated test and all gates are green.

## 3. Architecture in one page

- **Daemon and kernel.** `kvman start` runs the daemon (one per home folder, `daemon.lock`). The kernel is the code inside it: router, scheduler, execution hosts, process supervisor, storage, registry and validation, UI registry, extension loader, workspaces and trust, capabilities, LLM service, preferences, notification tray, adapters, secrets, observability. **The kernel knows no product concept** (sessions, chats, tools, PDFs…): those live in extensions. The kernel never runs extension code on its main thread.
- **Three message kinds.** `command` (do, one handler, returns its result: the reply), `query` (read, one handler, never queued, never stored), `event` (happened, many subscribers; delivered `durable`, `transient`, or `live`). Everything pushed to people travels on one SSE stream per browser.
- **Access.** Every command and query declares `access`: `all` (default), `user` (people only), `extensions` (extension code only), `internal` (its own extension and the kernel). The kernel checks it against the kernel-assigned source.
- **Unit of work.** A handler's storage writes, sent messages, published events, reply, config writes, and inbox state commit in one SQLite transaction or not at all. External effects go through `ctx.step` (journaled) or `ctx.process`. Live events are the only thing sent before commit, and the kernel resets them if the attempt does not commit.
- **Lanes.** A handler's `lane` template (`'file:{{ $payload.fileId }}'`) orders messages: one at a time per lane, lanes in parallel.
- **Deadlines vs timeouts.** `deadlineAt` (message, absolute, final: `DEADLINE_EXCEEDED`) is not `timeoutMs` (one attempt, retryable: `HANDLER_TIMEOUT`).
- **Storage.** One SQLite database (`better-sqlite3`, WAL), single writer with group commit; blobs are content-addressed files; secrets in `secrets.json`. Extensions use `ctx.store` (`kv`, `collection()`, `log()`, `blobs`, `global`) and see only their own data. No pagination anywhere: filters, `limit`, and hard caps that fail loudly.
- **Extensions.** `defineExtension(meta, setup)`. `setup(ext)` only registers (`ext.register<Kind>`), is synchronous and deterministic, and is recorded at install into a static **manifest**; handlers act through `ctx`. Hosts: `shared` (built-ins), `dedicated`, or `sandboxed` (default for everything else: Node permission model plus `--no-experimental-sqlite`). Capabilities are requested, granted all-or-nothing by the person in the shell's grant dialog, and enforced by the kernel.
- **UI.** The frame is code, its content is data. Extensions and presets register pages, nav, panels, toolbar and status items, actions, renderers, and components; every container declares what it accepts; validation runs before anything renders. UI is registered, never pushed (only toasts and notifications are pushed). Power-granting commands are confirmed only in the shell-drawn grant dialog. Localized from day one (`en`, `ar`, right-to-left); the language is a saved kernel preference and never part of a URL.
- **Agent.** The `agent` extension runs turns as a chain of short committed steps. Other extensions extend it through its API: prompt sections (`agent.prompt.section.set`) and guards (`agent.guards.set`, `agent.tool.call.created` → `agent.tool.call.review`). Tools are commands or queries flagged `agentTool`.
- **Packages and import walls** (enforced by ESLint; never bypass them):

  | Package | May import |
  |---|---|
  | `protocol` | `zod` only (schemas and pure validators; no I/O) |
  | `sdk` | `protocol` |
  | `kernel` | `protocol`, `sdk` (types only); starts `devtools` scripts as child processes, never imports them |
  | `testkit` | `kernel`, `sdk`, `protocol` |
  | `shell`, `widget-bridge`, `cli` | `protocol` |
  | `devtools` | `protocol`, `testkit` |
  | `extensions/*`, `examples/*` | `sdk`, `protocol`, their own declared dependencies; never `kernel`, `shell`, or another extension |

## 4. Naming

- Message types: `<ns>.<segment>…`, lowercase, kebab-case segments. Commands end in an imperative verb, queries in a read verb (`get`, `list`, `search`, `count`, `preview`, `validate`), events in a past participle. One name is never two kinds.
- **Public names are written in full everywhere**, including when registering: `ext.registerCommand('pdf.translate', …)`, `ctx.command('pdf.translate', …)`, `{ "command": "pdf.translate" }`. Private names (collections, logs, schedules) are plain.
- Error codes: kernel `UPPER_SNAKE` from `plan/13` §13.2; extensions `<ns>/UPPER_SNAKE`, registered with `ext.registerError` and thrown with `ctx.problem(code, { params })`.
- The vocabulary is the same on every surface: `ctx.command` waits for a result, `ctx.send` does not, `ctx.query` reads, `ctx.publish` announces, `ctx.live` streams a preview; HTTP `POST /commands/:type` and `/queries/:type`; CLI `kvman command` / `kvman query`. Views: `refreshOn`, `live`, `$item`. Capabilities: `calls`, `tools`, `files.read`, `files.write`, …
- Code identifiers: descriptive full words, no abbreviations beyond the plan's own (`ctx`, `ext`, `id`), no Hungarian notation, no `utils`/`helpers`/`misc` dumping grounds.

## 5. Code rules

- TypeScript strict with `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `any`. No default exports except `defineExtension(...)` results.
- **Explicit and clean.** Small functions, one responsibility per module, no clever tricks, no dead code, no premature abstraction. Files are at most 300 lines (lint-enforced).
- **Minimal comments.** Code explains itself through names. Comment only a non-obvious invariant (commit ordering, lane rules, deadline inheritance). Public exports of `@kvman/sdk` and `@kvman/widget-bridge` carry a one-line TSDoc comment: it is the API reference.
- **Decoupling and separation of concerns.** Modules talk through typed interfaces (storage driver, host protocol, adapters), never through each other's internals; import a package only through its public entry point; keep I/O at the edges and logic pure where it can be; dependencies are passed in, not reached for globally. Shared shapes live only in `@kvman/protocol`, never duplicated.
- **Validate every boundary with Zod**: adapters, host frames, handler inputs and outputs, manifests, presets, view trees, persisted JSON.
- **Errors** are Problems with catalog codes (`plan/13` §13.1). Never throw strings, never swallow an error, never return `null` to mean "failed".
- **No workarounds.** No hacks, stubs, placeholder implementations, TODO/FIXME, commented-out code, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `.skip` or `.only`, sleeps or retries that hide races, catch-and-ignore, or test-only branches in production code. Fix the cause. If the right fix needs something the plan does not say, ask (§1).
- **Dependencies**: only those the plan names, at the latest stable version, pinned exactly. A new dependency is a question for the product owner (and an ADR), not a decision.
- **Logs** (Pino) never contain payloads, config values, secrets, or request bodies.
- **User-facing text** is always a translation key with parameters (`$t…`), with `en` and `ar` entries; no literal UI strings. Styles use logical CSS only (`ms-*`, `pe-*`, `text-start`…).

## 6. Security rules that are never relaxed

Never weaken, bypass, or "temporarily" disable: `access` checks, capability enforcement, sandbox flags (`--permission`, `--no-experimental-sqlite`), the grant dialog, the trust gate, Host/Origin checks, the shell and widget CSPs, the Markdown sanitizer (no `v-html` anywhere else), blob serving rules, secrets handling, or fail-closed guards. A test that needs one of these off is a wrong test.

## 7. Testing rules

- Test layers are in `plan/14` §14.2; crash fault points and invariants in §14.3; performance targets in §14.6.
- Tests are deterministic: fake clocks and IDs where time matters, no network (npm tests use the local registry from `KVMAN_NPM_REGISTRY`), no order dependence.
- A failing test is fixed at its cause, never skipped, loosened, or retried until green.

## 8. Commits

Conventional commits; changesets for `protocol`, `sdk`, `testkit`, `widget-bridge`, and extensions. Commit or push only when the product owner asks.
