# 14 — Quality and Testing

## 14.1 Code rules

- TypeScript strict with `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `any`. No default exports except `defineExtension(meta, setup)` results.
- Zod validates every boundary: adapters, host protocol frames, handler inputs/outputs, manifests, presets, view trees, persisted JSON.
- Shared shapes live in `@kvman/protocol` only; never duplicated.
- Import walls from `01` §1.5, enforced by ESLint `no-restricted-imports`.
- Files: 300-line cap enforced by ESLint `max-lines` (tests and generated files excluded). Prefer small modules with one responsibility.
- Code is explicit and clean: descriptive names, small functions, no clever tricks, no dead code. Comments only for non-obvious invariants (commit ordering, lane rules, deadline inheritance); public exports of `@kvman/sdk` and `@kvman/widget-bridge` carry a one-line TSDoc comment, which becomes the API reference (§14.5).
- **Decoupling and separation of concerns**: each module has one responsibility and talks to others through a typed interface (the storage driver, the host protocol, adapters); no package reaches into another's internals (only its public entry point); the kernel knows no product concept (`00` global rule 1); I/O stays at the edges and domain logic stays pure where it can.
- **No workarounds.** No hacks, stubs, TODOs, commented-out code, `@ts-ignore` / `@ts-expect-error`, `eslint-disable`, skipped or `.only` tests, sleeps to hide races, catch-and-ignore, or test-only branches in production code. Fix the cause. If the right fix needs something the plan does not say, stop and ask (§14.4).
- Conventional commits, changesets for `protocol`, `sdk`, `testkit`, `widget-bridge`, and extensions; ADRs in `plan/adr/`.

## 14.2 Test layers

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | pure helpers: filter language, bindings resolver, canonical JSON/digest, scheduler selection, tool-schema generation |
| Kernel conformance | Vitest + real SQLite | the three kinds and every event delivery class (durable, transient, live with kernel resets), `access` for every source type, idempotency, lanes, reentrancy, deferred replies, continuations, timers, retries, dead letters, capability checks, unit-of-work atomicity, read-your-writes, migrations |
| Fault injection | Vitest + child-process kernel | crash (`SIGKILL`) at every named fault point (§14.3), then restart and assert invariants |
| Model-based | fast-check | random sequences of sends/crashes/cancels against a reference model of lanes and replies |
| Extension contract | `@kvman/testkit` | each core extension's commands, queries, events, contributions; the same suite runs `shared` and `sandboxed` |
| Agent scenarios | testkit + scripted `fakeProvider` (registered through the provider API) | turns, tools, steering, cancel, compaction, subagents, restart mid-turn, interviewer across restart; prompt sections (order, ownership, refresh on `agent.activated`, removal on disable); a query tool run inline and a command tool through its continuation; guards (fail-closed placeholder, allow, deny, release on disable or `[]`, a guard that asks the person); ADMIT rejecting unknown tools and invalid arguments; a subagent's approval and question shown in the root session; `agent.inject` starting a turn; a message typed during a cancel; `local-guard`; `agent.chat.start`; a step whose LLM call streams for longer than 60 s |
| Builder | testkit + fixture projects | `kernel.dev.build` on a clean project, a type error, an npm import, a failing test, a path escape, and a build over its deadline; a test that writes a file, starts a process, or loads `node:sqlite` fails inside the test process; a project `tsconfig.json` that loosens strictness has no effect; `kvman ext dev` staging with dependencies |
| UI | Vitest + Vue Test Utils | every component against its spec (props, events, children); renderer bindings, conditions, actions, forms from schemas; slot `accepts` and ordering; registry refresh on `kernel.preset.changed`; `$t` resolution, fallback chain, ICU plurals (all six Arabic forms), `format` output in `en` and `ar` |
| Localization | Vitest + lint | catalog checks for every core extension (keys used exist in `en`, `ar` complete, valid ICU); a lint rule that fails the shell build on physical CSS direction classes |
| End-to-end | Playwright | shell against a real kernel: first run (language picker), chat, presets apply/edit/save-as, extension install, PDF example, builder publish/rollback, reconnect/resume, kernel restart with open tabs, 8+ tabs sharing one stream, leader-tab handover, language switch reaching every open tab without reload, the main flows in both `ltr` and `rtl` with screenshot comparison, a preset that hides the sidebar and Settings with recovery through the kvman menu; notifications replaced by key, dismissed in one tab and gone in the other, read state shared across tabs, rate limit folding, desktop alert opt-in; a subagent's approval answered from the root thread; entity actions on a detail page; an unknown `?ws=` falling back with a toast; the builder's preview pane leaving the main tab's workspace unchanged; a folder's `preset.json` applied with one confirmation; a version switch listed in the apply preview; switching the language never changes the URL, and a copied link opens in the saved language |
| Security | Vitest + Playwright | the matrix in `13` §13.8 |
| Performance | custom bench runner | §14.6 targets |

## 14.3 Fault points

The kernel exposes named fault points. They are compiled into every build and do nothing unless `KVMAN_FAULTS=<point>[@<hit>]` is set when the daemon starts; the kernel then sends itself `SIGKILL` the `<hit>`-th time (default the first) it reaches that point, and an unknown point fails the start with `VALIDATION_FAILED` (ADR 0100, which also places each point M1 reaches):

`admit.before-commit`, `admit.after-commit`, `claim.after`, `invoke.before`, `step.after-begin`, `step.before-record`, `command.after-send`, `uow.before-commit`, `uow.after-commit-before-notify`, `defer.before-reply`, `process.after-spawn-before-release`, `process.after-release`, `process.after-exit-before-onexit`, `reload.after-drain`, `reload.after-migrate-before-swap`, `preset.apply.after-stage`, `preset.apply.after-version-switch`, `migration.mid`, `live.after-publish-before-commit`, `blob.put.after-file-before-ref`, `secrets.after-commit-before-file`, `workspace.forget.after-cancel`, `guard.after-created-before-review`, `dev.build.after-bundle`.

**Invariants checked after every crash + restart** (M1.9 checks 1, 2, 3, 4, 6, and 8; the milestones that build the other mechanisms add theirs):
1. No committed storage effect is lost or applied twice.
2. Every command ends in exactly one terminal state with at most one reply.
3. No message emitted by a handler is duplicated (derived idempotency keys).
4. Lane order is preserved for completed messages.
5. Every process started before the crash is either still tracked or killed and marked, and every detached one that ended receives exactly one `onExit` (`03` §3.7).
6. Steps that started without recording surface `EFFECT_INDETERMINATE` unless retry-safe.
7. The agent history has no duplicated or orphaned tool call/result entries.
8. Every live-event run published by an attempt that did not commit has received `{ reset: true }` (`02` §2.3). After a kernel crash the restart is the reset: live rings and counters are memory only, so none of the dead attempt's chunks survive, and `hello` lists no subscription (ADR 0101).
9. No committed blob reference points to a missing file, and no `pending:` reference survives its invocation's deadline plus 1 h (`04` §4.6).
10. `secrets.json` parses and equals either the value before or after the interrupted write (`04` §4.7).
11. No tool command exists for a call that a covering guard (or a `'<ns>'` placeholder) has not allowed (`09` §9.5).
12. After restart, `extensions.migrating` is either cleared or the interrupted migration resumes and completes or quarantines (`04` §4.8).
13. A forgotten workspace has no rows, messages, processes, or preset left, whatever the crash point (`04` §4.4).

## 14.4 Milestone discipline

- Milestones are the small steps of `15` §15.4 (M0.1 … M7.3), executed in order as described in `15` §15.1.
- **1. Scenarios first.** Before any code, write `milestones/<id>-TEST-CASES.md` (e.g. `milestones/M2.4-TEST-CASES.md`) with two sections, **Happy path** and **Edge cases**: one Given/When/Then scenario per *Done when* bullet, plus every failure, limit, race, and error code the milestone's *Read* sections name. Each scenario has an id (`M2.4-H3`, `M2.4-E7`) and the test file it will live in.
- **2. Implement** exactly the milestone's *Build* list.
- **3. Tests match the scenarios**: one test per scenario, named with its id; no scenario without a test and no test without a scenario. A scenario found missing during implementation is added to the file first (and asked about first if it changes behavior the plan does not specify).
- **4. Everything passes**: all tests of the repository, not only the new ones, plus the gates below; only then the next milestone starts.
- **Ask, don't assume.** When the plan does not specify something that affects behavior, a public shape, a dependency, security, or stored data, or two sections seem to disagree, stop and ask the product owner. Never invent an answer. Each answer is recorded as an ADR in `plan/adr/` (and the plan is corrected) before the code lands. Only private names and the internal layout inside a package are the implementer's choice.
- Gates for every milestone: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check`, all green before the next milestone starts. Until M1.9 creates the benchmark baseline, `bench:check` passes and prints "no baseline yet"; from then on, a benchmark without a stored baseline fails (ADR 0103).
- Each milestone updates the root README (status, how to run).

## 14.5 Documentation as a deliverable

- `docs/extension-guide.md`, `docs/view-language.md`, `docs/llms.txt`, and the examples are deliverables of M2.13, M3.10, and M6.3: an example that does not run in the gates fails them (ADR 0007: until a CI system is chosen, "in CI" means the local gates).
- Descriptions are linted: empty ones fail recording, and a placeholder (`todo`, `tbd`, `fixme`, `xxx`, `description`, `placeholder`, `...`, `…`, text starting with `lorem ipsum`, or the registration's own name) is a recording warning (ADR 0169).
- `docs/extension-guide.md` opens with **your first extension in 10 minutes**: `kvman ext new` → `kvman ext dev --watch` → edit a command and see it in the shell → `npm test` → `npm publish`. Its code examples are projects under `examples/` whose tests run in the gates from M2.13; the walkthrough itself runs as a test from M2.14 (CLI steps) and M3.10 (the shell step) (ADR 0168).
- `docs/naming.md` is a one-page cheat sheet: the naming grammar (`02` §2.4), full public names, the vocabulary (`ctx.command` waits, `ctx.send` does not, `ctx.query` reads; `lane`, `live`, `refreshOn`, `$item`), and the `register<Kind>` rule.
- An API reference for `@kvman/sdk` and `@kvman/widget-bridge` is generated with TypeDoc from their types into `docs/api/` (git-ignored) by `pnpm build`; an exported declaration or member of either package without a doc comment fails the build (ADR 0168).

## 14.6 Performance targets (measured in M1.9 and M7.2 on the reference machine)

The reference machine is a 4-core laptop (x86-64 or Apple silicon) with 16 GB RAM and an SSD, running Linux or macOS. A target that cannot be met is changed only by an ADR with the measurements. CI runs the same benchmarks against its own stored baseline.

| Metric | Target |
|---|---|
| No-op durable command, HTTP round trip | p50 ≤ 5 ms, p99 ≤ 25 ms |
| Sustained durable commands (single workspace, batching) | ≥ 2,000/s |
| Query on an indexed collection (≤10k docs) | p99 ≤ 20 ms |
| Agent step prompt build with 10 prompt sections (read from storage) | p99 ≤ 10 ms |
| Live event added latency, handler → browser | ≤ 30 ms |
| Kernel idle memory with all core extensions (shared pool) | ≤ 200 MB RSS |
| Cold boot to ready (15 extensions, 1 GB database) | ≤ 2 s |
| Shell first meaningful paint (warm cache) | ≤ 1 s |
| Chat thread with 2,000 entries (the `historyWindow` default) scrolls | 60 fps on the reference machine |

`pnpm bench:check` fails on a regression of more than 20% against the stored baseline, on a missed target, and on a metric without a baseline value. The baseline is the committed `bench/baseline.json`, recorded on the product owner's machine with `pnpm bench:record` (which refuses to write when a target is missed); each metric is the median of 5 rounds after a warm-up (ADR 0103).

M1.9 measures the first four rows, with the kernel in a child process and the load over real HTTP and SSE from the parent; the live-event target applies at p99. Until M7.2 re-measures on the reference machine, `bench:check` enforces a round-trip p50 of ≤ 10 ms and ≥ 1,000 sustained commands/s, set from the M1.9 measurements (ADR 0105); the table above stays the goal. Idle memory and cold boot are measured in M7.2, once core extensions exist (ADR 0104).

## 14.7 Dependency policy

Latest stable versions at M0.1 and M7.3 (`pnpm up --latest`), exact versions recorded in the root `package.json`, frozen lockfile in CI, a weekly scheduled job that opens one update PR and never fails ordinary CI. Holding an older major requires an ADR. CI is deferred (ADR 0007): until a CI system is chosen, the gates run locally, and the frozen-lockfile check and the weekly update job wait for it.
