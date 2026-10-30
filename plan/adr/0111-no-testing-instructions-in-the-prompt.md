# ADR 0111 — No testing instructions in the prompt

Status: accepted by the product owner on 2026-10-30. It amends plan 08 §8.2, ADR 0102 (2), and ADR 0012 (10).

## Context

The owner asked why kvcoder always runs tests, even when a change doesn't need them and the person didn't ask. The
engineering method told it to from several places: Execute ran the tests that cover each change and the whole suite at
the end; Finish counted "its checks and tests pass" as part of done; the check rule offered "run its test" as a way
to check; "Tests the person chose" (ADR 0102, 2) asked how to test and, with "Decide for me", ran the existing tests;
and a worker's Do it step checked "with the project's own check or tests" and ran the tests that cover its change. No
rule said when tests aren't needed, so every change ran them.

## Decisions

1. **The prompt says nothing about running, writing, or skipping tests** (the owner: "remove these instructions from
   prompt and not tell it to test or skip test"). The model decides from the task, the person's words, and the
   project's own rules (`AGENTS.md` and the other rules files still reach the prompt, a `Testing:` line in them too).
   Removed from the lead's engineering method:
   - the part "Tests the person chose", with its `ask choice`, its `Testing:` line in `AGENTS.md`, and the "Decide for
     me" form that ran the existing tests;
   - Execute's sentence "Check in proportion: after each change, run the tests that cover it; run the whole suite once,
     at the end; and run no stress, load, performance, or benchmark test unless the person asked for one.";
   - Finish's "its checks and tests pass".
   Removed from a worker's Do it step: "with the project's own check or tests" and the sentence "Write only the kinds
   of tests the `Testing:` line of the project's AGENTS.md names, run the tests that cover your change, and run no
   stress, load, performance, or benchmark test unless the task asks for one."
   Removed from the check rule both roles end with: "or run its test".
2. **What stays.** The general rules to check a change and fix a failure at its cause, to say what is unchecked, and
   to check a result the way the person would (run it, or request its address). The `risky` rule still calls running
   the project's own build, tests, and tools ordinary work. The `delegate` connector's `check` run kind and the shipped
   `tester` worker stay: they are tools the agent may choose, not instructions to test.
