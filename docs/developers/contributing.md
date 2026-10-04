# Contributing to kvman

This page is for anyone changing kvman itself: the kernel, the SDK, the testkit, the CLI, or the core extensions. When you finish, you can follow the repository's rules: the specification, the gates, the walls, naming, tests, security, and commits.

The authoritative text is `CLAUDE.md` at the repository root; this page summarizes it.

## The specification comes first

`plan/` is the specification. Names, shapes, error codes, defaults, and limits there are exact. Read `plan/README.md` and every file it lists before changing anything.

- If the plan doesn't specify something that affects behavior, a public shape (a schema, a command or query name, an SDK call, an error code, a route), a dependency, security, or stored data, **ask** the product owner with real alternatives; never invent an answer or silently pick a default.
- If two plan sections disagree, or the plan looks wrong, ask.
- Record every answer in an ADR in `plan/adr/` and correct the plan text before the code lands.
- Only private names and the internal layout of a package are yours to choose.

## Work in milestones

Work is done milestone by milestone (`plan/13-milestones.md`), in order: read its sections, write `milestones/<id>-TEST-CASES.md` (one Given/When/Then scenario per *Done when* bullet, plus every failure, limit, race, and error code the sections name, each with an id and its test file), implement exactly what is asked and nothing from a later milestone, write one test per scenario with the id in its name, and pass every gate.

## The gates

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check
```

All must pass before a commit. There is no CI in this phase: run them locally.

## Code rules

- TypeScript strict, with `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. No `any`. No default exports except an extension's entry.
- Explicit and clean: small functions, one responsibility per module, no clever tricks, no dead code, no premature abstraction. Files, tests included, are at most 300 lines (lint-enforced).
- Comments are minimal: only a non-obvious invariant. Every public export of `@kvman/sdk` has a one-line TSDoc comment.
- Validate every boundary with zod: handler inputs and outputs, settings, presets, manifests, HTTP bodies, persisted JSON.
- Errors are Problems with catalog codes. Never throw strings, swallow an error, or return `null` to mean "failed".
- A handler's in-process work ends when it returns: no `setTimeout`, `setInterval`, or unawaited promises that outlive it.
- **No workarounds:** no stubs, placeholders, TODO or FIXME, commented-out code, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `.skip` or `.only`, sleeps or retries that hide races, catch-and-ignore, or test-only branches in production code. Fix the cause, or ask.
- Dependencies: only those in the plan, at the latest stable version (TypeScript stays on 6.0 until typescript-eslint supports 7), pinned exactly. A new dependency is a question for the product owner.
- Logs (Pino) never contain payloads, settings values, secrets, or request bodies.
- User-facing text is always a translation key with `en` and `ar` entries. Styles use logical CSS only.

## The walls

The import table in [architecture.md](architecture.md) is enforced by ESLint. Never bypass it.

## Naming

- Command and query names are `<namespace>.<segment>…`, lowercase, with kebab-case segments. A command ends in an imperative verb; a query ends in a read verb (`get`, `list`, `search`, `count`). Names are written in full everywhere.
- Error codes: the kernel's are `UPPER_SNAKE` from `plan/05-errors.md`; an extension's are `<namespace>/UPPER_SNAKE`.
- Code identifiers are descriptive full words: no abbreviations beyond `ctx` and `id`, and no `utils`, `helpers`, or `misc` modules.

## Security rules that are never relaxed

- **Secrets** live only in `secrets.json`, and are never logged, stored elsewhere, or returned.
- **The listener** stays on `127.0.0.1` only, with its Host and Origin checks.

A test that needs one of these off is a wrong test.

## Testing

Tests are deterministic: fake clocks and ids where time matters, no network, no order dependence, and never the real `~/.kvman`. A failing test is fixed at its cause, never skipped, loosened, or retried until green. See [testing.md](testing.md).

## Commits

Conventional commits, with a changeset for every change to `@kvman/sdk`, `@kvman/testkit`, or an extension (the kernel and CLI follow the root version). Commit each finished milestone to `main`; never push.

## Next

- [architecture.md](architecture.md)
- [testing.md](testing.md)
- [publishing.md](publishing.md)
