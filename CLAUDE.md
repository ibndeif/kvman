# kvman — rules for working in this repository

kvman is an app that works like a small operating system for every kind of user. A kernel runs extensions; a preset chooses the extensions and settings that make the app. Every feature is an extension, including the web UI and the AI agent.

The specification is `plan/`. Read `plan/README.md` and every file it lists before any work. Names, shapes, error codes, defaults, and limits in the plan are exact. The v2 implementation is archived on the branch `archive/v2`. When a step needs something that exists there (the SQLite setup, ESLint walls, test config), read it and reuse it, adapted to the new plan; the new plan always wins over old code.

## 1. Ask, don't assume

- If the plan doesn't specify something that affects behavior, a public shape (schema, command or query name, SDK call, error code, route), a dependency, security, or stored data: **stop and ask the product owner** with real alternatives, with the recommended one first. Never invent an answer or silently pick a default.
- If two plan sections disagree, or the plan looks wrong: stop and ask.
- Record every answer in an ADR in `plan/adr/` and correct the plan text before the code lands.
- Only private names and the internal layout of a package are yours to choose.

## 2. How to work: milestone by milestone

Milestones are in `plan/13-milestones.md`. Do them strictly in order. For each one:

1. **Read** its sections. Ask about anything unclear now.
2. **Write the scenarios** in `milestones/<id>-TEST-CASES.md` before any code:
   - **Happy path**: one Given/When/Then scenario per *Done when* bullet.
   - **Edge cases**: every failure, limit, race, and error code the sections name.
   Each scenario has an id (`M1.2-H3`, `M1.2-E7`) and names its test file.
3. **Implement** exactly the *Build* list, and nothing from a later milestone.
4. **Write the tests**, one per scenario, each named with its scenario id.
5. **Pass every gate**: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check`.
6. **Record** in the root `README.md` what now works and how to run it, then commit.

## 3. Architecture in one page

- **Running.** `kvman [--mode web] [--preset coder]` is a foreground app that runs locally, one per home folder (`~/.kvman`). It opens the folder it's started from as a workspace, and a second run hands its folder over to the running one. HTTP listens on `127.0.0.1:3737`.
- **Platforms.** Linux, macOS, and Windows, natively. Code that depends on the OS (shells, process trees, file modes) has an explicit branch per OS, and its tests cover each branch.
- **Not a chat app.** kvman is a platform: the kernel and kvwebui hold no product concept (no chat, no agent). Product UI belongs to the extension that owns it, and presets place it.
- **Jobs.** Everything runs as a job: a **command** (may write) or a **query** (read-only).
  - `ctx.exec` runs a job now and returns its output.
  - `ctx.execAsync` and `ctx.schedule` make SQLite rows that survive restarts and retry.
  - There are no events or listeners. Owners offer fixed points that others register handlers for: the kernel's job and lifecycle points (`ctx.registerHandler`), and extension registries such as kvcoder's connectors.
- **Workers.** A `worker_threads` pool runs every job. The kernel's main thread never runs extension code. `AsyncLocalStorage` gives each handler its current job (workspace, caller, signal).
- **Storage.** One SQLite database (better-sqlite3, WAL), with a connection per worker. Extensions get Promise-based `ctx.store` (kv and JSON collections), per workspace plus `global`. Each call commits alone; `transaction(tx => …)` is synchronous.
- **Extensions.**
  - An extension's `package.json` `kvman` field declares its namespace and dependencies, and `main` (or `kvman.source` for a `path:` extension) default-exports `(ctx) => void`, which registers commands, queries, and settings with zod schemas and descriptions.
  - `@kvman/sdk` is a peerDependency: every extension shares the kernel's copy, and its `z`.
  - Registrations are private unless `public: true`.
  - There's no sandbox in this phase: non-bundled versions need the person's trust at start.
- **The kernel knows no product concept.** UI, agents, and tools live in extensions (kvai, kvwebui, kvcoder, kvdev).
- **Import walls** (enforced by ESLint; never bypass them):

  | Package | May import |
  |---|---|
  | `sdk` | `zod` |
  | `kernel` | `sdk`, its declared dependencies |
  | `cli` | `kernel`, `sdk` |
  | `testkit` | `kernel`, `sdk` |
  | `extensions/*` | `sdk`, their own declared dependencies; never `kernel`; another extension only when it is a `kvman.dependencies` entry: `import type`, or a runtime import of a subpath it exports (such a subpath may import only `sdk` and holds no state) |

## 4. Naming

- Command and query names are `<namespace>.<segment>…`, lowercase, with kebab-case segments. A command ends in an imperative verb. A query ends in a read verb (`get`, `list`, `search`, `count`).
- Names are written in full everywhere: `ctx.registerCommand('kvcoder.turn.run', …)`, `ctx.exec('kvcoder.turn.run', …)`.
- Error codes: the kernel's are `UPPER_SNAKE` from `plan/05-errors.md`; an extension's are `<namespace>/UPPER_SNAKE`.
- Code identifiers are descriptive full words: no abbreviations beyond `ctx` and `id`, and no `utils`, `helpers`, or `misc` modules.

## 5. Code rules

- TypeScript strict, with `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. No `any`. No default exports except an extension's entry.
- **Explicit and clean.** Small functions, one responsibility per module, no clever tricks, no dead code, no premature abstraction. Files are at most 300 lines (lint-enforced).
- **Comments.** Minimal: comment only a non-obvious invariant. Every public export of `@kvman/sdk` has a one-line TSDoc comment.
- **Validation.** Validate every boundary with zod: handler inputs and outputs, settings, presets, manifests, HTTP bodies, and persisted JSON.
- **Errors** are Problems with catalog codes. Never throw strings, swallow an error, or return `null` to mean "failed".
- **Work ends with its job.** A handler's in-process work ends when it returns: no `setTimeout`, `setInterval`, or unawaited promises that outlive it. Long work uses `execAsync` or `ctx.schedule`; long-lived child processes use `ctx.processes`.
- **No workarounds.** No stubs, placeholders, TODO or FIXME, commented-out code, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `.skip` or `.only`, sleeps or retries that hide races, catch-and-ignore, or test-only branches in production code. Fix the cause, or ask (§1).
- **Dependencies.** Only those in the plan, at the latest stable version, pinned exactly. A new dependency is a question for the product owner.
- **Logs** (Pino) never contain payloads, settings values, secrets, or request bodies.
- **User-facing text** is always a translation key with `en` and `ar` entries. Styles use logical CSS only.

## 6. Security rules that are never relaxed

Never weaken, bypass, or "temporarily" disable either of these:
- **Secrets handling.** Secrets live only in `secrets.json`, and are never logged, stored elsewhere, or returned.
- **The listener.** It stays on 127.0.0.1 only, with its Host and Origin checks.

A test that needs one of these off is a wrong test. Everything else (the trust prompt, `public` checks, read-only queries) is ordinary behavior, specified and tested like any other.

## 7. Testing rules

- Tests are deterministic: use fake clocks and ids where time matters, no network, and no order dependence. Tests never touch the real `~/.kvman`.
- A failing test is fixed at its cause, never skipped, loosened, or retried until green.

## 8. Commits

Conventional commits, with a changeset for every change to `@kvman/sdk`, `@kvman/testkit`, or an extension (the kernel and CLI follow the root version). Commit each finished milestone to main; never push.
