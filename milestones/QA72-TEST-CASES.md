# QA 72 — no testing instructions in the prompt (ADR 0111)

**Asked.** The owner asked why kvcoder always runs tests, even when they aren't needed or asked for, and then said to
remove the instructions from the prompt and tell it neither to test nor to skip tests. The answer is ADR 0111.

Paths are relative to `extensions/kvcoder/`.

## Happy path

- **QA72-H1 the lead's method says nothing about tests.** *Then* the lead's engineering prompt, with and without
  `decides`, has no `Testing:` rule, no `ask choice` about tests, no "Check in proportion", no "run the whole suite",
  no "benchmark test", and no "run its test"; Finish reads "it follows the project's conventions, and nothing
  unfinished or temporary is left behind". `test/unit/prompt-method.test.ts`
- **QA72-H2 a worker's method says nothing about tests.** *Then* a worker's engineering Do it step reads "Make the
  smallest change, and propose the smallest design, that does the task; check it, and fix a failure at its cause.
  Write each file in its own call, with `fs write`." and the prompt has no `Testing:` and no "run the tests".
  `test/unit/prompt-method.test.ts`
- **QA72-H3 the check rule names no test.** *Then* both roles' prompts hold "Before you say that something runs or
  works, check it the way the person would: run it or request its address; if you couldn't, say what is unchecked."
  `test/unit/prompt-build.test.ts`

## Edge cases

- **QA72-E1 a project's own `Testing:` line still reaches the prompt.** *Given* an `AGENTS.md` holding `Testing: Run
  the existing tests only.`, *then* the prompt shows it among the project's rules, unchanged. `test/project-rules.test.ts`
- **QA72-E2 running tests stays ordinary work.** *Then* the `risky` rule still calls running the project's own build,
  tests, and tools ordinary work, so `risky` is false for it. `test/unit/prompt-build.test.ts`
