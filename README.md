# kvman

kvman is a local **actor runtime with a UI shell**: a small kernel delivers typed messages between actors (extensions, people, processes) and commits their effects atomically. Every feature, including the AI agent, is an extension. The specification is in [`plan/`](plan/README.md); working rules are in [`CLAUDE.md`](CLAUDE.md).

## Status

| Milestone | State | What works |
|---|---|---|
| M0.1 Monorepo scaffold | done | pnpm workspace with Turborepo; the eight packages of `plan/01` §1.5 with empty entry points; strict TypeScript; ESLint with the import walls and the 300-line cap; Vitest; Playwright installed; changesets; the ADR template |
| M0.2 Protocol: messaging core | done | `@kvman/protocol`: Zod schemas for addresses, the message envelope, kinds, delivery classes, `access`, live chunks, replies, problems and issues, the HTTP request bodies; the kernel error catalog; canonical JSON and SHA-256 digests (Web Crypto); the naming-grammar checker with fix hints; the filter language and its evaluator. A repository test checks that every milestone scenario has exactly one test |
| M0.3 Protocol: extensions, presets, LLM | done | `@kvman/protocol`: the manifest schema (`plan/05` §5.12) with lane templates, function references, and capability requests; the `Capabilities` grant; the source grammar and integrity rules; the `Preset` schema and the preset secret check; config field meta; translation catalogs; blob ids; the LLM request, result, message, and model shapes; the extension stage result. UI definitions inside manifests and presets are checked for ids and descriptions; M0.4 adds their full shapes |
| M0.4 Protocol: UI contract | done | `@kvman/protocol`: the binding-path parser, conditions, and the view-language base types; actions and effects; a spec with props, events, children rules, and an example for each of the 45 built-in components; a structural view validator (props, children, parents, child counts, bindings) with exact issue paths; every contribution shape, composites, and widgets, now used by manifests and presets; the frame slot catalog; the UI registry; toasts and notifications; SSE messages; the schema-endpoint document |

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

Answers to questions the plan left open are ADRs in [`plan/adr/`](plan/adr/): TypeScript held at 6.x (0005), `typescript-eslint` and `@types/node` 24 (0006), CI deferred (0007), filter-language semantics (0008), SHA-256 through Web Crypto (0009), exact naming-grammar checks (0010), `Issue.severity` and `Problem.retryAfterMs` (0011), dev-project reads as queries (0012), manifest recording rules (0013), LLM messages and tool calls (0014), the stage result (0015), durations, private names, lane templates, and naming exceptions (0016), the preset secret check (0017), blob ids (0018), preset integrity for dev and local sources (0019), test tools in package tests (0020), public npm access (0021), kernel error titles in the plan (0022), `z.text()`/`z.action()` in JSON Schema (0023), component `parents` (0024), frame slots and component rules in `/schema` (0025), the binding grammar (0026), the SSE event shape (0027), `muted` text (0028), `childCount` and input controls (0029), an integer `protocolVersion` (0030). ADRs 0001–0004 are reserved for the M0.5 spikes.
