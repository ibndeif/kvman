# 01 — Architecture

## 1.1 Layers

```
 Clients         Browser shell (tabs)        kvman CLI        Processes (kv shim + job token)
                        │ HTTP + SSE              │ HTTP + SSE         │ local socket
 ───────────────────────┼─────────────────────────┼────────────────────┼──────────────────
 Daemon process (kvman start)
 Kernel          Adapters: HTTP · SSE · local socket · static shell · widget origins
 (main thread)   Router → admission (schema, capability, scope, idempotency)
                 Scheduler: lanes · priorities · timers · retries · dead letters
                 Storage engine: SQLite single writer · group commit · step journal · blobs
                 Registry & validation · UI registry · Extension loader · Workspaces & trust · Capabilities
                 Process supervisor · Supervisor of hosts · LLM service (models, providers)
                 User preferences · Notification tray · Secrets · Observability
 ───────────────────────┬───────────────────────────────────┬──────────────────────────────
 Execution hosts  Shared worker pool (N threads)     Dedicated worker    Sandboxed process
                  built-in extensions                one extension       one extension (default for
                  (worker threads in the daemon)     (thread)            non-built-in), Node permission
                                                                         model, child process
 ───────────────────────┴───────────────────────────────────┴──────────────────────────────
 Extensions      Agent pack: agent · llm-providers · shell · fs · todo · interviewer · rules · skills · persona · local-guard
                 Platform pack: settings · presets · extensions · inspector
                 Extension Builder: builder
                 Third-party / builder-generated: pdf · ocr · …
```

The **daemon** is the OS process started by `kvman start` (one per home folder, guarded by `daemon.lock`). The **kernel** is the kvman code running inside it: everything in the middle band above. The kernel never runs extension code on its main thread; extensions run in hosts the kernel starts (worker threads inside the daemon, or sandboxed child processes it supervises). Extensions never import the kernel or each other.

## 1.2 Actors

| Actor | Address | Sends | Handles |
|---|---|---|---|
| Extension | `ext:<package-name>` | commands, queries, events (durable, transient, live), and its handlers' results (replies) | its namespace's commands and queries; durable and transient events it subscribes to |
| User | `user:<userId>` (clients: `user:<userId>/client:<clientId>`) | commands and queries (the only source allowed for `access: 'user'` types; never `extensions` or `internal` ones) | receives over SSE: events, live events, late replies, and the one-way `ui.toast` / `ui.notify` / `ui.dismiss` / `ui.navigate` (handled by the kernel, drawn by the shell); prompts are extension data shown in extension UI (`08` §8.13) |
| Process | `proc:<processId>` | commands and queries allowed by its job token | nothing |
| Kernel API | `kernel` | events (`kernel.*`), replies, timer messages | `kernel.*` commands and queries |

The source address of every message is assigned by the kernel from the authenticated caller. Callers cannot forge it.

## 1.3 Kernel vs core extensions

| Kernel (fixed, small) | Core extensions (shipped, replaceable, can be disabled) |
|---|---|
| Inbox, router, all message kinds | `agent` — sessions, history, step-chain turns, tools, compaction, subagents |
| Scheduler, lanes, timers, retries, dead letters | `llm-providers` — provider implementations (pi-ai), credentials, logins |
| Execution hosts and their supervision | `shell` — agent bash tool, jobs, logs |
| Process supervisor (`ctx.process`) | `fs` — workspace file tools; `local-guard` — asks before shell commands reach kvman itself |
| Storage engine, unit of work, step journal, blobs, migrations | `todo`, `interviewer`, `rules`, `skills`, `persona` |
| Registry, schema endpoint, `kernel.validate`, UI registry (`08` §8.6) | `settings` — settings pages generated from config schemas |
| Extension loader, snapshot store, install mechanics | `presets` — catalog, apply, edit, save-as, low-code pages |
| Workspaces (including preview workspaces), workspace I/O, trust gate | `extensions` — install/enable/rollback UI |
| Capabilities and grants | `inspector` — traces, dead letters, metrics |
| LLM service: provider/model registry, defaults, `ctx.llm` call path, usage | `builder` — the Extension Builder (`11`), shipped with kvman but not part of the platform pack |
| Preset application (enable states, grants, config) | |
| User preferences (language, theme), notification tray | |
| Adapters: HTTP, SSE event stream, local socket, CLI | |
| Secrets store, config storage | |
| Logs, traces, metrics | |

Rule: if a piece of code needs to know what a session, a chat message, a prompt, or a PDF is, it is not kernel code. The LLM service only routes completion requests to provider extensions and records usage; it never builds prompts.

"Small" means the kernel knows no product concepts, not that it has few features. A feature belongs in the kernel when one of these is true, and each kernel feature above that is not plain message delivery exists for one of them:

| Reason | Kernel features it justifies |
|---|---|
| **It must work when every extension is disabled, broken, or quarantined** (so the person can always repair the system) | UI registry, preset application, user preferences (language, theme), notification tray, recovery page data |
| **It enforces a security boundary that an extension could otherwise bypass** | capabilities and grants, trust gate, secrets, the LLM call path (so the `llm` capability, deadlines, and usage accounting cannot be skipped by calling a provider directly) |
| **Only one owner can exist per home folder** | storage engine, extension loader, workspaces, process supervisor, adapters |

A proposal to move one of these into an extension must first show how that reason would still be met.

## 1.4 Request flows

**A user sends a chat message**

```
shell ──POST command agent.send{sessionId,text,idemKey}──▶ router: validate · capability · idempotency · persist
scheduler: lane (agent, session:abc) free → worker pool → agent.send handler
  UoW: append user entry · set turn running · send agent.step       ──commit──▶ reply {entrySeq}
agent.step handler: read prompt sections (registered earlier by rules, skills, …) · ctx.llm.complete → kernel → llm-providers host
  (tokens → live event agent.tokens.generated:abc → SSE → shell)
  UoW: append assistant entry · tool call recorded, no guard registered → send shell.exec{…, onReply: agent.tool.record}   ──commit
  (with guards: publish agent.tool.call.created, wait for agent.tool.call.review from each guard, 09 §9.5)
shell.exec handler (lane job:j1): ctx.process.spawn … output → live event shell.output.written:j1
  UoW: job record · reply {exitCode, tail}  ──commit──▶ continuation agent.tool.record (lane session:abc)
agent.tool.record: append tool result · send agent.step (round+1) … until the model answers without tools
  → publish agent.turn.completed
```

**The UI lists sessions**

```
shell ──POST query agent.sessions.list{workspaceId}──▶ router ──▶ agent query handler (read-only, priority lane)
  reads collection "sessions" through a read-only connection ──▶ result (no inbox write)
```

**A PDF app (third-party extension, no agent involved)**

```
shell ──PUT /api/v1/blobs──▶ blobId
shell ──command pdf.import{blobId}──▶ pdf handler (lane file:<blobId>)
  step: extract text (process or library) · UoW: files collection insert · publish pdf.imported
shell (page bound to query pdf.files.list, refreshOn pdf.*) refetches the table
user clicks row action "Translate" ──command pdf.translate{fileId,lang}──▶ pdf handler
  ctx.llm.complete{…, live: {text: pdf.progress.updated:<fileId>}} · blob put · UoW update + publish pdf.translated
```

## 1.5 Monorepo

```
kvman/
  CLAUDE.md (working rules) · package.json · pnpm-workspace.yaml · turbo.json · tsconfig.base.json · eslint.config.js
  packages/
    protocol/        @kvman/protocol — Zod schemas only: envelope, kinds, manifest, capabilities,
                     view language, UI contract (frame slot catalog, component specs, UiRegistry), catalogs,
                     presets, problems, error codes, SSE messages, schema endpoint. Pure validators only
                     (naming grammar, filter language, canonical JSON); no I/O.
    sdk/             @kvman/sdk — defineExtension, the ext registration API, ctx types, helpers (prompts, llmProblem,
                     z.blobId, z.text, z.action).
    kernel/          @kvman/kernel — the kernel; `kvman start` runs it as the daemon process.
    testkit/         @kvman/testkit — runs the real kernel with in-memory SQLite for extension tests; its remote
                     mode is a client of a test kernel, for builder projects' sandboxed tests (11 §11.5).
    shell/           @kvman/shell — Vue SPA: frame and shell-only zones, renderer, component library, data layer,
                     notifications, formatting, right-to-left, kvman catalogs (en, ar).
    widget-bridge/   @kvman/widget-bridge — tiny library used inside widget iframes.
    cli/             @kvman/cli — `kvman` command and the `kv` shim.
    devtools/        @kvman/devtools — TypeScript, esbuild, and the build and test-run scripts of kernel.dev.build
                     (11 §11.5); the kernel starts these scripts as child processes and never imports them.
  extensions/
    agent llm-providers shell fs todo interviewer rules skills persona local-guard   (agent pack)
    settings presets extensions inspector                                   (platform pack)
    builder                                                                 (Extension Builder)
  examples/
    pdf-translator/  reference third-party extension + preset (acceptance in M3.10 and M5.5)
  docs/
    llms.txt · extension-guide.md · view-language.md · examples index
  plan/  milestones/
```

### Import walls (enforced by ESLint)

| Package | May import |
|---|---|
| `protocol` | `zod` only |
| `sdk` | `protocol` |
| `kernel` | `protocol`, `sdk` (types only). It starts `devtools` scripts as child processes by path and never imports `devtools` |
| `testkit` | `kernel`, `sdk`, `protocol` |
| `shell`, `widget-bridge` | `protocol` |
| `cli` | `protocol` |
| `devtools` | `protocol`, `testkit` |
| `extensions/*`, `examples/*` | `sdk`, `protocol`, their own declared dependencies. Never `kernel`, `shell`, or another extension. |

## 1.6 Runtime layout

```
~/.kvman/                         (0700) the home folder; `--home <dir>` or KVMAN_HOME chooses another (00 R-Q4)
  kvman.db  kvman.db-wal  kvman.db-shm      (0600) inbox, journal, storage, registry, workspaces, presets,
                                             preferences, notifications
  secrets.json                               (0600) credentials, never exported or backed up
  daemon.lock                                exclusive lock {pid, processStart, nonce, port, startedAt}
  kernel.sock                                (0600) local socket for kv shim and CLI fallback
  blobs/ab/cd/<sha256>                       content-addressed bytes
  jobs/<processId>.log                       live process logs (capped, finalized into blobs)
  extensions/
    staging/<uuid>/                          scripts-disabled installs in progress
    snapshots/<sha256>/                      immutable verified snapshots + manifest.json (05 §5.12)
                                             + files.json (the file list behind the digest)
    dev/<project>/                           builder working copies
  previews/<name>/                           preview workspaces for the builder (07 §7.1)
  bin/kv                                     shim used by processes
  logs/kernel.log                            rotated Pino JSON
~/kvman/                                     default Home workspace
<workspace>/.kvman/                          user files only, trust-gated: rules/, skills/, preset.json (optional, for sharing)
```

## 1.7 Design rules that shape everything

1. **Register, then run.** Everything an extension registers in `setup` is recorded in its manifest before any handler runs.
2. **Handlers are pure-ish functions.** Input message + storage → storage writes + messages + reply. External effects go through `ctx.step` or `ctx.process`.
3. **Reads don't queue.** Queries never wait behind commands.
4. **State has one owner.** Each piece of data belongs to one extension namespace; others ask for it.
5. **The frame is code; the UI inside it is data.** Pages, contributions, and presets are JSON that the shell renders into typed slots; the shell never loads extension code, and nothing is pushed at runtime except toasts and notifications (`08`).
6. **Text is keys until it is drawn.** User-facing text travels as translation keys with parameters; the shell renders it in the person's language (`08` §8.16).
