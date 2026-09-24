# kvman v2 — Implementation Plan (executive view)

Decisions: `00-decisions.md`. Details: `01`–`15`.

## What we are building

A local **actor runtime with a UI shell**. A small kernel routes typed messages between actors and commits their effects atomically. Every feature is an extension, including the AI agent. Presets package extensions, pages, and settings into apps a non-technical user can pick, and a builder lets kvman extend itself with an LLM.

## The core ideas

1. **One communication model.** Every kind is dispatched the same way (registry → host → registered function); commands and queries return the handler's result in the same response, events return nothing. Three message kinds: `command` (do, one handler, returns its result), `query` (read, one handler, never queued), `event` (happened, many subscribers; delivered `durable`, `transient`, or `live` for tokens and progress). Everything pushed to people travels over one SSE stream. Every message has a kernel-assigned source, correlation, and schema. Names follow one grammar per kind (`pdf.translate` vs `pdf.translated` vs `pdf.files.list`), and every command and query declares its `access`: `all`, `user` (people only), `extensions` (extension code only), or `internal` (its own extension only).
2. **SQLite as the durable heart.** One database holds the inbox, step journal, extension storage, registry, and presets. A handler's storage writes, emitted messages, reply, and inbox state commit in **one transaction**, so state and messages can never disagree. External effects go through a journaled `ctx.step` so they are not repeated after a crash.
3. **Lanes for safe parallelism.** Messages with the same key run in order; different keys run in parallel on a shared worker pool. Extensions can opt into a dedicated worker or a sandboxed process.
4. **Explicit, recorded registration.** `defineExtension(meta, setup)`: `setup(ext)` registers everything with one explicit call each (`registerCommand`, `subscribe`, `registerConfig`, `registerPage`, `registerProvider`, `requestCapability`, …); handlers act through a separate `ctx`. `setup` is recorded at install in a sandboxed loader into a static manifest, so the kernel validates it, the UI discovers it, the grant screen shows it, and the builder generates it.
5. **Capabilities and isolation.** What an extension can do (including `tools`, the agent's access to every enabled tool) is requested or derived from its registrations, granted by the user in a shell-drawn dialog, and enforced by the kernel (and by the OS for sandboxed extensions, the default for everything not built in). Extensions cannot read each other's data, events, or blobs without a grant.
6. **UI contract: the frame is code, its content is data.** The shell owns a fixed frame whose regions are typed slots (the sidebar accepts nav groups, items, and separators; the status bar accepts status items; …) plus shell-only zones (kvman menu, notifications, grant dialog) that nothing can hide or imitate. Extensions and presets contribute pages, nav, toolbar and status items, panels, actions, renderers, and components (composite or widget, private or public); every container declares what it accepts and validation rejects the rest before anything runs. The kernel serves a per-workspace UI registry refreshed on `kernel.preset.changed`. UI is registered, never pushed: a question or approval is a registered panel that data makes visible, and only toasts and notifications are pushed. Extensions own their prompts, answered through user-only commands (`access: 'user'`). Presets hide and order things, but visibility never grants or blocks anything.
7. **Localized from day one.** The language is a kernel preference that reaches every tab and handler (`ctx.locale`). Extensions ship ICU catalogs and use `$t` keys; notices and problems are stored as keys, so they change language too. Right-to-left is built in; v2 ships English and Arabic.
8. **LLM is a kernel service; the agent is an extension.** The kernel owns the model registry and the `ctx.llm` call path; providers are extensions (`llm-providers` wraps pi-ai). A turn is a chain of short committed steps; tools are commands flagged as agent tools; other extensions extend the agent through its API: they register prompt sections and act as guards that review tool calls through events; compaction happens in place.
9. **Self-extension.** The Builder (the `agent` and `builder` extensions) climbs a ladder — preset → extension → widget — validating, testing, and previewing in a sandbox before the user approves a publish.

## Kernel vs extensions

| Kernel | Core extensions |
|---|---|
| router, scheduler, hosts, process supervisor, storage, registry/validation, dev-project build, UI registry, loader, workspaces/trust (incl. preview workspaces), capabilities, LLM service (registry, routing, usage), user preferences, notification tray, adapters, secrets, observability | **agent pack**: agent, llm-providers, shell, fs, todo, interviewer, rules, skills, persona, local-guard · **platform pack**: settings, presets, extensions, inspector · **Extension Builder**: builder |

## Stack

Node 24 LTS · strict TypeScript · pnpm + Turborepo · Zod 4 · Ajv 8 · Fastify 5 (HTTP + SSE) · Pino · SQLite via `better-sqlite3` · Vue 3 + Vite + Tailwind + Reka UI · TanStack Virtual · lucide icons · `intl-messageformat` · markdown-it + DOMPurify + Shiki (class output) · Vitest + Playwright + fast-check · TypeScript + esbuild in `@kvman/devtools` for the builder (its projects' tests run with `node:test`). pi-ai only inside the `llm-providers` extension (D55).

## Packages

`protocol` (schemas) · `sdk` · `kernel` · `testkit` · `shell` · `widget-bridge` · `cli` (`kvman`, `kv`) · `devtools` (builder toolchain) · `extensions/*` · `examples/pdf-translator` · `docs/`.

## Milestones

57 small milestones in 8 phases, executed in order (`15`). Each lists what to read, what to build, and the tests that prove it is done.

| Phase | Scope | Milestones | Days |
|---|---|---|---|
| M0 | Foundations: monorepo, protocol schemas (messaging, extensions, presets, LLM, UI contract), spikes and ADRs | M0.1–M0.5 | 8 |
| M1 | Kernel core: storage engine, store API, SDK core, router, scheduler, shared hosts, cancellation, lifecycle and minimal adapters, fault injection and benchmarks | M1.1–M1.9 | 17 |
| M2 | Extension system: validation, install, workspaces and enable, capabilities and isolation, blobs and trust, processes and `kv`, reload and migrations, the `kvman` CLI with the extension-author tools, presets and preview workspaces, LLM service, UI registration and registry, localization, notifications, testkit and developer docs | M2.1–M2.14 | 29.5 |
| M3 | Shell and UI contract: scaffold and theming, data layer, frame, renderer and components, contributions, extension components and widgets, notifications and grant dialog, right-to-left pass, PDF example | M3.1–M3.10 | 21 |
| M4 | Agent pack: llm-providers, sessions, turns, and prompt sections, tools (commands and queries) and guards with `shell`, fs/todo/interviewer/local-guard, rules/skills/persona and compaction, subagents and chat UI; Coding Agent acceptance | M4.1–M4.6 | 19 |
| M5 | Platform pack and presets: settings, extensions, presets and low-code pages, inspector, built-in presets and the PDF Translator app | M5.1–M5.5 | 10 |
| M6 | Self-extension: builder core and the sandboxed dev-project build, preview, Builder UI and preset, publish and rollback, evaluation set | M6.1–M6.5 | 14 |
| M7 | Hardening and release: security matrix, soak and upgrades, packaging | M7.1–M7.3 | 10 |

128.5 working days, about 26 weeks. M4.1–M4.5 may run in parallel with M3 (`15` §15.3).

## Quality bar

- `milestones/<id>-TEST-CASES.md` written before each milestone; typecheck, lint, test, build, and benchmark gates before moving on.
- Crash injection at every commit boundary with 13 invariants (no lost or duplicated effects, one terminal state per command, no duplicate emitted messages, lane order, tracked processes with one exit notice each, indeterminate steps surfaced, clean agent history, live-event resets, blob references, whole secrets file, guarded tool calls, finished migrations, complete workspace forget).
- Performance targets: no-op command p50 ≤ 5 ms, ≥ 2,000 durable commands/s, indexed query p99 ≤ 20 ms, ≤ 200 MB idle memory, boot ≤ 2 s.
- Security matrix for rendering, localhost edge, widgets, capabilities, sandbox (including `node:sqlite` turned off), trust, secrets, UI placement, and notifications.
- Every core extension ships complete `en` and `ar` catalogs; main flows are tested left-to-right and right-to-left.

## Acceptance scenarios

1. **Coding Agent**: chat with streaming, shell jobs, file tools, todos, questions and approvals across restarts, guards, rules and skills, compaction, subagents, cancel, and steering (M4.6).
2. **PDF Translator** built by hand as a third-party extension and preset, used by a non-technical user with one confirmation (M3.10, M5.5).
3. **Self-built PDF Translator**: the Builder produces, tests, previews, publishes, and rolls back the same app from one plain-language request (M6.4–M6.5).
4. **Fresh install to working chat or PDF app in under 5 minutes** (M7.3).
