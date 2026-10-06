# Brief templates

Copy one into your scratchpad, fill every `<…>`, and delete sections that don't apply. Write it for a capable engineer who has never seen this conversation: everything they need that isn't already in the repository goes in the brief.

## Work brief

```markdown
# Task: <one line: what to build>

You are the implementer. The reviewer has already made every design decision below; carry them out exactly. Do not delegate this task and do not run opencode.

## Goal
<2–4 sentences: what this slice is and why it exists, so you can make sense of the spec.>

## Read first
- `CLAUDE.md`: the project rules. They bind you (code rules §5, import walls §3, security §6).
- <plan sections, e.g. `plan/06-…md` §6.4, and only those>
- <existing files to imitate for structure and style, e.g. `packages/kernel/src/hosts/rpc-service.ts`>

## Specification (decided: follow exactly)
<Exact names, types, shapes, error codes, limits, and behavior. Quote the plan text where it exists. Say which file each piece lives in.>

## Scope
You may create or modify only:
- <path>
- <path>

Do not modify anything else. In particular: no new or changed dependencies (`package.json`, `pnpm-lock.yaml`), nothing under `plan/`, no tests outside this slice.

## Scenarios (test tasks only)
Each test's name starts with its scenario id. One test per scenario, no test without a scenario.
- <M2.7-H1>: <Given/When/Then, or "see milestones/M2.7-TEST-CASES.md"> → `<test file>`
- <M2.7-E3>: … → `<test file>`

## Rules that are easy to break
- No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `.skip`, `.only`, TODO/FIXME, commented-out code, sleeps or retries that hide races, catch-and-ignore.
- Errors are Problems with catalog codes; never throw strings.
- Files stay under 300 lines; split by responsibility, not into `utils`.
- Match the surrounding code's naming, comment density, and idiom.

## Done when
Run these and make them pass:
- `pnpm --filter <package> typecheck`
- `pnpm vitest run <test files>`
- `pnpm lint`

## If something is unclear
Stop and ask. Don't guess. If the specification doesn't settle a behavior, a name, or a shape, do the parts that are settled, leave the rest, and put the question under QUESTIONS. Correct partial work with a question is better than complete work built on a guess.

## Report
End your final message with exactly this block:

SUMMARY: <what you did, 1–3 sentences>
FILES: <each file created or changed, one per line>
COMMANDS RUN: <each Done-when command → pass/fail, with the failure if any>
QUESTIONS: <none | numbered questions>
DEVIATIONS: <none | anything you did differently from this brief, and why>
```

## Feedback brief (same session, `--session <id>`)

```markdown
# Review round <n>: fix these defects

Fix exactly these; change nothing else.

1. `<file>:<line>`: <what is wrong>. Expected: <what it should be> (<plan section or rule>).
2. …

Then run the Done-when commands again:
- <commands>

End with the same report block (SUMMARY / FILES / COMMANDS RUN / QUESTIONS / DEVIATIONS).
```

## Read-only brief (`--agent plan`)

```markdown
# Inventory: <question>

Read-only: do not modify any file.

Find <precise thing> in <paths>. For each hit give `file:line` and <the fields you need>.
Report "none found" rather than guessing. Stop when the search is exhausted; don't fix anything.

End with:
RESULTS: <list>
SEARCHED: <paths and patterns you covered>
UNSURE: <none | hits you could not classify>
```
