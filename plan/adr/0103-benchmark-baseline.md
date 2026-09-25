# ADR 0103 — The benchmark baseline and `bench:check`

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M1.9
- **Decided by**: the product owner

## Question

`14` §14.4 and §14.6 say:

- `pnpm bench:check` compares the benchmarks with a stored baseline;
- it fails on a regression of more than 20%;
- from M1.9 on, it fails on a benchmark without a baseline.

The plan does not say:

- where the baseline lives;
- how noise is kept out of the comparison, since 20% of a latency near 1 ms is well within run-to-run noise;
- whether the §14.6 targets are checked too.

## Options

1. **A committed baseline, and the median of 5 rounds.**
2. **A per-machine baseline** in a git-ignored folder, with the same comparison.
3. **A committed baseline, and one run.** Simplest, but it would fail at random on small latencies.

## Decision

Option 1.

**The baseline file.**

- It is `bench/baseline.json`, and it is committed.
- It is recorded on the product owner's machine, which serves as the reference machine.
- It holds the machine description and one value per metric of every benchmark.

**How a metric is measured.**

- Each benchmark warms up first.
- It then runs 5 rounds.
- A metric's value is the median of its 5 round values.

**When `pnpm bench:check` fails.** It runs every benchmark and fails when any of these holds:

- a metric is more than 20% worse than its baseline value (higher for a latency, lower for a throughput);
- a metric misses its §14.6 target;
- a benchmark or metric has no baseline value.

It prints a table with each metric's value, baseline, change, and target.

**Recording a new baseline.**

- `pnpm bench:record` runs the same benchmarks and rewrites `bench/baseline.json`.
- It refuses to write when a target is missed, because a target changes only by an ADR with measurements (§14.6).
- It is run on purpose, and the change is reviewed like code.

## Consequences

- **Scripts.**
  - The root gets `bench:record`.
  - `bench:check` runs the benchmark runner from `@kvman/testkit`.
  - `scripts/bench-check.ts` ("no baseline yet") is removed.
- **Scenarios.** `M0.1-H1` no longer runs `bench:check` inside `pnpm test`: benchmarks measured while the test suite runs in parallel measure the suite. The gate itself runs it, and M1.9 scenarios cover the check rules.
- **Plan correction:** `14` §14.4 and §14.6.
