# ADR 0102 — The model test of lanes and replies

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M1.9
- **Decided by**: the product owner

## Question

`14` §14.2 asks for "random sequences of sends/crashes/cancels against a reference model of lanes and replies" (fast-check). M1.9 asks for 1,000 clean sequences. The plan does not say what system the sequences run against.

## Options

1. **The scheduling core.** It runs in-process on real SQLite: the router, the commit pipeline, the pending index, the scheduler, crash recovery, and cancel units. A test dispatcher ends the invocations. 1,000 sequences take seconds.
2. **The full runtime with worker hosts.** It is the most faithful option, but 1,000 sequences take minutes in every `pnpm test`.
3. **Both.** 1,000 sequences on the core, plus about 50 on the full runtime.

## Decision

Option 1.

**The sequences.**

- The model test drives the kernel's own router, commit pipeline, pending index, scheduler, and crash recovery on a real SQLite file.
- A test dispatcher records claims and ends each invocation as the sequence says:
  - a result;
  - a retryable failure;
  - a final failure;
  - a deferral, later answered by a reply from another invocation.
- Every ending goes through the real invocation unit.
- **Cancels** go through the real cancel unit.
- **A crash** drops every in-memory object: index, scheduler, pipeline, and dispatcher. Then boot recovery runs on the file, as `03` §3.9 does.
- **Time** moves on a manual clock, so retry backoffs pass without real waiting.
- **Commands** have a lane or none, and may carry `onReply`.

**The reference model states these properties after every step:**

- At most one message of a lane is running.
- A message never starts while an earlier message of its lane (lower `seq`) is not in a final state.
- Every command ends in exactly one final state, with at most one reply. A done command's reply is the value it returned. A deferred command's reply is the value it was answered with.
- A command with `onReply` gets exactly one continuation, and only once it is final.
- A cancelled message never starts again.
- A crash while running counts an attempt. At `maxAttempts` the message becomes dead with `MESSAGE_DEAD` (ADR 0091).

The test runs 1,000 sequences in `pnpm test` with a fixed seed. A failure prints its seed and the shrunk sequence.

## Consequences

- `fast-check` (named in `00` D55) is added to the kernel's dev dependencies, at its latest version, pinned exactly.
- The full runtime with worker hosts stays covered by the conformance tests and by the child-process fault harness.
