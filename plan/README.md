# kvman v2 — Plan Index

kvman v2 is an **actor runtime with a UI shell**. A small kernel delivers typed messages between actors (extensions, users, processes) and commits their effects atomically. Every feature — including the AI agent — is an extension. Presets turn a set of extensions, pages, and settings into an "app" that a non-technical user can pick. A builder extension lets kvman extend itself with an LLM.

`00-decisions.md` is the source of truth. If any other file disagrees with it, `00` wins.

## How to implement from this plan

1. Read `00`, this README, and `01` once, in full.
2. Work through the milestones of `15` §15.4 in order (M0.1, M0.2, …, M7.3), one at a time, following the procedure in `15` §15.1: read the listed sections, write the happy-path and edge-case scenarios, implement exactly the listed scope, write the tests that match the scenarios, pass everything.
3. Use names, shapes, error codes, defaults, and limits exactly as written. Types in code blocks are normative and go into `@kvman/protocol` or the SDK as written; prose rules are normative too.
4. When something needed is not specified, or two sections seem to disagree, stop and ask the product owner; never assume or invent. Record each answer as an ADR in `plan/adr/` and correct the plan before the code lands. `CLAUDE.md` at the repository root holds the working rules.

## Reading order

| # | File | What it defines |
|---|---|---|
| 0 | `00-decisions.md` | Locked decisions, principles, global rules, resolved questions |
| 1 | `01-architecture.md` | Layers, actors, kernel vs extensions, request flows, monorepo, runtime layout |
| 2 | `02-messaging.md` | Addresses, envelope, the three message kinds and event delivery classes, access, lanes, priority, idempotency, request/reply, deadlines |
| 3 | `03-kernel.md` | Router, scheduler, execution hosts, process supervisor, the full `kernel.*` API reference (payloads, results, who may send), boot/recovery/first run, LLM service |
| 4 | `04-storage.md` | SQLite layout, unit-of-work commit, store API, step journal, blobs, migrations |
| 5 | `05-extension-api.md` | `defineExtension(meta, setup)`, the `ext` registration API (including UI and translations), handler `ctx`, capabilities (including `tools`), config, testkit, LLM access, the manifest (§5.12) |
| 6 | `06-extension-lifecycle.md` | Sources, install, validation, enable, hot reload, versions, rollback |
| 7 | `07-workspaces-presets.md` | Workspaces, preview workspaces, trust gate, presets as apps, config values, built-in presets |
| 8 | `08-ui.md` | The UI contract: frame, regions, panes and routing, contribution kinds and slots, base types, UI registry, view language, every built-in component with its props, extension components, runtime UI, notifications, prompts and the grant dialog, widgets, localization and right-to-left, preset visibility, edge cases |
| 9 | `09-agent.md` | The `agent` core extension: sessions, step-chain turns, tools and guards, prompt sections, compaction, subagents, slash commands |
| 10 | `10-core-extensions.md` | `llm-providers`, `shell`, `fs`, `todo`, `interviewer`, `rules`, `skills`, `persona`, `local-guard`, platform pack |
| 11 | `11-self-extension.md` | The Extension Builder preset and the `builder` extension: escalation ladder, dev projects and `kernel.dev.build`, validation, preview, publish |
| 12 | `12-api-transport.md` | HTTP, SSE event stream, local socket + job tokens, `kvman` CLI, `kv` shim |
| 13 | `13-errors-observability-security.md` | Problems, error catalog, logging, tracing, security model |
| 14 | `14-quality-testing.md` | Code rules, test layers, fault injection, performance gates |
| 15 | `15-phases-risks.md` | How to execute, 57 small milestones (M0.1–M7.3) in 8 phases with scope, reading list, and done-when tests; risks, cut list, backlog |
| — | `IMPLEMENTATION_PLAN.md` | Executive summary |

## Glossary

| Term | Meaning |
|---|---|
| **Daemon** | The OS process that `kvman start` runs in the background: one per home folder (`~/.kvman` unless `--home` or `KVMAN_HOME` names another), guarded by `daemon.lock`. It contains the kernel and the shared worker threads, and it starts sandboxed extension processes. |
| **Kernel** | The kvman code inside the daemon that is not an extension. Routes messages, schedules handlers, commits storage, supervises hosts and processes, runs the LLM service. Contains no product features. The plan says "kernel" for behavior and "daemon" only for the process. |
| **Actor** | Anything that sends or handles messages: an extension, a user (browser client), a process acting through a job token, or the kernel's own API. |
| **Extension** | A package built with `defineExtension(meta, setup)`. Its `setup(ext)` registers message handlers, subscriptions, storage, config, UI contributions, providers, and capability requests with explicit `ext.register*` calls; its handlers act through `ctx`. |
| **Manifest** | The static record of everything an extension's `setup` registered, captured at install in a sandboxed loader: JSON, with schemas as JSON Schema, lanes as templates, and functions as references (`05` §5.12). The kernel keeps it in its registry; no listener objects exist in memory. Not to be confused with the **file list** (`files.json`), the hashes behind a snapshot digest. |
| **Message** | The only way actors communicate. Kinds: `command`, `query`, `event` (delivered `durable`, `transient`, or `live`). A command's result is its reply. |
| **Access** | Who may call a command or query: `all`, `user`, `extensions`, or `internal` (`02` §2.4). |
| **Live event** | An event sent at once (before commit) to screens only, addressed `<type>:<key>`; used for tokens and progress (`02` §2.3). |
| **Prompt section** | Text an extension registers with the agent for its system prompt (`09` §9.6). |
| **Guard** | An extension registered with the agent that reviews tool calls and allows or denies them (`09` §9.5). |
| **Lane** | An ordering queue `(extension, lane)`, declared on a handler as a template: `lane: 'file:{{ $payload.fileId }}'`. Messages in one lane run one at a time, in order. Different lanes run in parallel. |
| **Unit of work (UoW)** | Everything one handler invocation writes: storage changes, emitted messages, its reply, and its inbox state. Committed in one transaction or not at all. |
| **Step** | A journaled external side effect (`ctx.step`) whose result is recorded so redelivery does not repeat it. |
| **Host** | Where handlers execute: shared worker pool, dedicated worker, or sandboxed process. |
| **Capability** | A user-granted permission, requested with `ext.requestCapability` (e.g. `process`, `llm`, `calls`, `tools`) or derived from registrations (`subscribes`, `provides-llm`), enforced by the kernel. Isolation is granted the same way. |
| **Provider / Model** | An LLM backend and its models, registered by an extension (`ext.registerProvider`, `ext.registerModel`). The kernel's LLM service routes `ctx.llm.complete` calls to them. |
| **Grant dialog** | The shell-drawn confirmation for power-granting kernel commands (trust, enable with grants, upgrades that need new grants, preset import/apply). Extensions can open it but never draw or confirm it. |
| **Workspace** | A folder identified by the SHA-256 of its canonical real path. Every message and most data are scoped to one. |
| **Preset** | A shareable "app" definition: which extensions (with grants), its own pages and nav, frame layout, hidden items, branding, labels, and settings a workspace uses. |
| **Preview workspace** | A throwaway workspace under `~/.kvman/previews/` that the builder uses to run a dev version with its own data. |
| **Pack** | A group of core extensions: the **agent pack** (`agent`, `llm-providers`, `shell`, `fs`, `todo`, `interviewer`, `rules`, `skills`, `persona`, `local-guard`) and the **platform pack** (`settings`, `presets`, `extensions`, `inspector`). `builder` (the Extension Builder) is in no pack. |
| **Shell** | The browser app (web UI). Owns the frame, the component library, the renderer, and the recovery page; owns no features. |
| **Frame** | The shell's fixed layout: top bar, sidebar, main area, status bar, overlay. Its regions are typed slots (`frame.*`); shell-only zones (kvman menu, notifications, grant dialog, …) accept nothing. |
| **Slot** | A named place that accepts contributions of declared kinds (`accepts`). Declared by the shell (`frame.sidebar`) or by an extension for its own pages (`agent.chat.prompt`). |
| **UI registry** | What the kernel serves the shell for one workspace: every visible contribution, ordered and labeled, computed from the applied preset and the enabled extensions. Refreshed on `kernel.preset.changed`, reload, and quarantine. |
| **Notification** | A one-way message to the person: a toast (`ui.toast`, transient) or a tray entry (`ui.notify`, stored). Drawn by the shell with the sender's name. |
| **Locale / catalog** | The person's language (a kernel preference, `ctx.locale`) and an extension's translations (`ext.registerTranslations`, ICU MessageFormat), referenced from views as `$t` keys. |
| **Contribution** | A UI piece an extension or preset adds, with an id `<ns>.<name>` (`preset.<name>` for presets). Kinds: page, nav group, nav item, separator, toolbar item, status item, panel, entity action, renderer, component, settings section. |
| **Component** | A named UI building block used in views: built into the shell (with props, events, and allowed children), or declared by an extension as a **composite** (a reusable view tree) or a **widget**, `private` or `public`. |
| **Widget** | A sandboxed iframe component shipped by an extension, for UI the component library cannot express. |
| **Prompt** | A question or approval an extension shows to a person in its own UI. The answer is an `access: 'user'` command that completes the extension's deferred reply. Registered with `ext.registerPrompt`; there is no kernel prompt primitive. |

## Conventions

- **MUST / MUST NOT / SHOULD / MAY** are normative.
- Message types are written `namespace.name` (e.g. `pdf.translate`) and follow the naming grammar in `02` §2.4 (commands imperative, queries end in a read verb, events in a past participle). Extension error codes are written `namespace/CODE`.
- Defaults, limits, and performance targets are the values to implement. They are measured in M1.9 and M7.2; a value that must change is changed only by an ADR in `plan/adr/` with the measurements.
- Every milestone writes `milestones/<id>-TEST-CASES.md` before implementation (`14` §14.4, `15` §15.1).
- Cross-references are written `` `08` §8.11 `` (file 08, section 8.11); decisions are `D<n>` in `00`.
