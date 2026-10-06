---
name: delegate-to-opencode
description: Makes Claude Code the brain and the locally installed opencode CLI the hands. Claude reads the spec, makes and asks about decisions, talks to the product owner, writes test scenarios, reviews diffs, and runs the gates; opencode writes the code, the tests, the docs, and does mechanical edits, through `opencode run`. Use this skill for any implementation work in this repository — implementing a milestone or part of one, writing or fixing tests, writing README/TSDoc/docs, refactors, lint or typecheck fixes, bulk edits — and whenever the user says delegate, hand off, opencode, "let opencode do it", or "you're the brain". Use it even when the user just says "implement M2.7" or "write the tests for these scenarios" without naming opencode.
---

# Delegate to opencode

> If you are opencode reading this: this skill is not for you. You are the implementer; do the task in your brief and end with the report it asks for.

You (Claude Code) are the **brain**. opencode is the **hands**. The point of the split is that your attention goes to what needs judgement (understanding the plan, choosing correctly, spotting a wrong diff) and the typing goes to a cheaper worker. It only works if two things hold: every decision is made *before* the work is handed off, and nothing handed back is trusted until you have read it and the gates are green.

## Who does what

| Brain: you, always | Hands: opencode |
|---|---|
| Reading the plan and the code needed to decide | Writing production code to a decided spec |
| Every decision; asking the product owner; ADRs; plan corrections | Writing the tests for scenarios you wrote |
| Writing `milestones/<id>-TEST-CASES.md` (the scenarios) | README, TSDoc, docs, changesets |
| Slicing work into briefs | Lint, typecheck, and test-failure fixes you have diagnosed |
| Reviewing every diff; judging security-sensitive code | Mechanical refactors, renames, bulk edits |
| Running the final gates and reporting to the user | Broad read-only inventories (`--agent plan`) |
| Commits (only when asked) | |

Do the work yourself instead of delegating when writing the brief would take longer than the change (roughly: one file, under ~15 lines, no tests), or when the change is the decision itself (an ADR, a plan correction, a scenario list).

opencode never decides. CLAUDE.md §1 still binds you: when the plan is silent, *you* ask the product owner. The brief tells opencode to stop and report a question rather than guess, so a question coming back from opencode is a question for you to answer or take to the user, never one to wave through.

**You must do the critical parts by yourself**

## The loop

### 1. Decide first

Before writing a brief, read what you need to pin down every behavior the slice touches: names, shapes, error codes, limits, file locations, which existing module to follow. Anything you cannot pin down from the plan goes to the user now, not into the brief as "use your judgement". A brief with an open decision in it produces a diff with an invented answer in it.

### 2. Slice

One brief is one coherent slice that can be verified on its own: a module and its tests, a set of scenarios, a doc section. Keep it to about ten files or fewer. Bigger briefs drift; opencode starts inventing structure you did not ask for. Order slices so each one builds on reviewed and accepted work.

### 3. Write the brief

Copy the template in `references/brief-template.md` into your scratchpad directory and fill it in. The parts that matter most:

- **Specification**: quote the exact names, shapes, and error codes from the plan. opencode can read `plan/` too, but it cannot tell which of two readings you chose.
- **Scope**: the exact files it may create or change. Everything else is off limits, especially `package.json` dependencies, the lockfile, `plan/`, and tests outside the slice.
- **Done when**: the exact commands it must run and see pass.
- **Report**: the fixed ending (SUMMARY / FILES / COMMANDS RUN / QUESTIONS / DEVIATIONS) that you will read first.

### 4. Run

```bash
bash .claude/skills/delegate-to-opencode/scripts/delegate.sh --brief <scratchpad>/brief-<slice>.md --title "<slice>"
```

- Anything bigger than a tiny task takes minutes. Run it with `run_in_background: true` and wait for the completion notification; do not poll.
- The script snapshots the working tree before and after (a git tree object, which leaves the index, the stash, and your uncommitted work untouched), so the diff it reports is exactly what changed during the run. **Do not edit files yourself while a write delegation is running**: your edits would show up as opencode's.
- Run one write delegation at a time. Read-only runs (`--agent plan`) can run in parallel with each other.
- Do not pass `--model`; opencode uses its own configured default. Pass `--model provider/model` only when the user asks for a specific model.
- Never add opencode's `--auto` flag. Its permission config is the safety boundary.

The script prints the session id, the final report, the tools used, the files changed, and the paths of the saved run folder (`brief.md`, `events.jsonl`, `changes.patch`, `before-tree`, `after-tree`). Read the summary; open `events.jsonl` only when something is unexplained.

### 5. Review: this is your real job

Read opencode's report, then check it against the diff; the diff is the truth.

1. **QUESTIONS first.** If it asked something, answer it from the plan or take it to the user, then continue in the same session (step 7). If it guessed instead of asking, treat the guess as a defect.
2. **Mechanical check**: `bash .claude/skills/delegate-to-opencode/scripts/check-diff.sh <run-dir>`. It flags the things CLAUDE.md forbids that are easy to grep: suppressions, `any`, `.skip`/`.only`, TODOs, files over 300 lines, dependency and lockfile changes, deleted or out-of-scope files. Every flag is a defect unless you can say why it isn't.
3. **Read the diff**, file by file (`git diff <before> <after> -- <path>`, the tree ids are in the run folder). Check: the spec was followed exactly; nothing outside scope; tests map one to one to scenario ids and would fail if the behavior broke (assertions on real values, not on "did not throw"); no test was loosened to pass; errors are catalog Problems; it reads like the surrounding code. Read code that touches CLAUDE.md §6 areas (access, capabilities, sandbox, trust, CSP, secrets, sanitizer) line by line.
4. **Run the checks yourself.** Don't take "all tests pass" in the report on trust. For a slice: typecheck the package and run the slice's test files. At the end of a milestone: the full gates `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check`.

### 6. Accept or revert

- Accept: nothing to do; the changes are already in the tree.
- Revert everything a run did: `bash .claude/skills/delegate-to-opencode/scripts/revert-run.sh <run-dir>`. Add paths after the run folder to revert only some files. It refuses to touch a file that changed again after the run, so it never destroys later work.

### 7. Feedback rounds

For defects, send a feedback brief into the **same session**, so opencode keeps its context:

```bash
bash .claude/skills/delegate-to-opencode/scripts/delegate.sh --brief <scratchpad>/feedback-<slice>-1.md --session <session-id>
```

A feedback brief lists concrete defects (`file:line`, what is wrong, what is expected, which plan section says so) and repeats the Done-when commands and the report format. Vague feedback ("make it cleaner") produces churn.

After about three rounds on the same slice without converging, stop. Either the brief was ambiguous (re-slice and write a clearer brief in a new session) or the fix needs judgement (do it yourself). Don't loop.

## Milestone workflow in this repository

CLAUDE.md §2 maps onto the split like this:

1. **Read**: you, in full. Ask the product owner about gaps now.
2. **Scenarios**: you write `milestones/<id>-TEST-CASES.md`. It is the contract every brief points to.
3. **Implement**: slice the *Build* list into briefs; opencode writes; you review each slice before briefing the next.
4. **Tests**: brief opencode with scenario ids, the test file named in each scenario, and the rule "test name starts with the scenario id". You verify the one-to-one mapping: every scenario has a test, every test has a scenario.
5. **Gates**: opencode runs them inside its slice; you run the full set yourself before calling the milestone done.
6. **README**: opencode drafts the section from your bullet points; you review the wording.

Then tell the user what was done, what you decided and why, what opencode did, and what you had to correct.

## Read-only delegation

For wide searches whose answer you need but whose file contents you don't ("list every error code thrown under `packages/kernel/src/hosts` that is not in `plan/13` §13.2"), use `--agent plan` with a brief that asks for a precise list with `file:line`. This saves your context. Spot-check a few entries before acting on the list, because opencode summarizes and can miss things.
