# ADR 0100 — Fault points: `KVMAN_FAULTS` and self-kill

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M1.9
- **Decided by**: the product owner

## Question

`14` §14.3 names the fault points and says they are "active only when `KVMAN_FAULTS` is set (test builds)". The plan does not say:

- what the variable holds;
- who kills the kernel at a point;
- whether published builds carry the points;
- what happens when the variable names an unknown point.

## Options

1. **An environment variable and a self-kill.** The points are always compiled in and do nothing by default. The kernel sends itself `SIGKILL` when it reaches the named point.
2. **The harness kills over IPC.** The kernel pauses at the point and reports it, and the harness sends the signal. This needs more machinery and works only for a kernel spawned with an IPC channel.
3. **A separate test build.** Only a test build of the kernel carries the points. This needs a build-time flag system and a second kernel artifact.

For an unknown point name: `VALIDATION_FAILED`, or `INTERNAL`.

## Decision

Option 1, and `VALIDATION_FAILED` for an unknown name.

**The setting.**

- The format is `KVMAN_FAULTS=<point>` or `KVMAN_FAULTS=<point>@<hit>`.
- `<point>` is one of the names of `14` §14.3. `@protocol` holds the list as `faultPointNames`.
- `<hit>` is a positive integer and defaults to 1.

**Parsing it.**

- The daemon entry reads the variable once, at start, and parses it with `faultSettingSchema` from `@kvman/protocol`. An empty or unset variable means no fault point is active.
- An invalid setting stops the start before the home check. That includes an unknown name, a malformed hit, and more than one point. The start report then carries a `VALIDATION_FAILED` Problem:
  - its issue path is `KVMAN_FAULTS`;
  - its hint lists the known point names.

**How the kernel uses it.**

- The kernel receives the parsed setting as a dependency, never as a global. Every module that holds a point calls `faults.reach('<point>')`.
- The inert implementation does nothing.
- The active one counts the calls for its one point. On the `<hit>`-th call it sends `SIGKILL` to its own process, so nothing after the point runs: no `finally`, no flush, no log line.

**Placement of the points M1 code reaches:**

| Point | Where |
|---|---|
| `admit.before-commit` | The commit pipeline, once a batch holding an adapter unit is applied and before `COMMIT` |
| `admit.after-commit` | The same batch after `COMMIT`, before any listener, waiter, or index is told |
| `claim.after` | The scheduler, once the claim that marks the message `running` is committed (in the batch that stored the message, or in a scheduler pass of its own, ADR 0105) and before the message is dispatched to its host |
| `invoke.before` | The host manager, just before the `invoke` frame is posted to the host thread |
| `step.after-begin` | The kernel's side of `step.begin`, after the `started` row is committed and before the host is answered |
| `step.before-record` | The kernel's side of `step.end`, before the `done` row is written |
| `command.after-send` | `ctx.command`, after the call's unit committed the command and before the caller waits for its reply |
| `uow.before-commit` | The commit pipeline, once a batch holding an invocation unit is applied and before `COMMIT` |
| `uow.after-commit-before-notify` | The same batch after `COMMIT`, before any listener, waiter, or index is told |
| `defer.before-reply` | The commit pipeline, once a batch holding an invocation unit that replies to a deferred command is applied and before `COMMIT` |
| `live.after-publish-before-commit` | The kernel's side of `ctx.live`, after the chunk is published |

The other points of §14.3 are placed by the milestones that build their mechanisms (`15` §15.4 M1.9).

**Invariants.** The M1.9 fault harness checks the invariants of §14.3 that M1 code reaches: 1, 2, 3, 4, 6, and 8 (8 as ADR 0101 defines it for a kernel crash).

## Consequences

- `@kvman/protocol` gains `faultPointNames` and `faultSettingSchema`.
- The kernel gains `FaultPoints`, which is passed through `BootOptions` and the runtime options.
- The daemon entry reads `KVMAN_FAULTS`.
- `14` §14.3 is corrected.
