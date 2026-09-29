# ADR 0166 — Testkit checks and fakes: unregistered codes, catalogs, processes, and crashes

- **Status**: accepted
- **Date**: 2026-09-29
- **Milestone**: M2.13
- **Decided by**: the product owner

## Question

`05` §5.10 says the testkit:

- fails a test whose handler throws an error code its extension did not register;
- checks the extension's catalogs;
- has fake processes;
- injects crashes with `k.crashDuring('pdf.translate', 'after-step:extract')`.

It leaves open:

- **Unregistered codes.** Today the kernel delivers the problem and logs a warning. When does the test fail?
- **Catalogs.** Recording already fails on a key missing from the default catalog, invalid ICU, and missing arguments (ADR 0160). It only warns on a key missing from another shipped catalog and on literal text. Which of these fail a test?
- **Processes.** What a fake process is.
- **Crashes.** The kernel's fault points (`14` §14.3, ADR 0100) kill a daemon process and are not scoped to a message type or a step name. What `crashDuring` does and which points it takes.

## Options

- **Unregistered codes:**
  1. **At the next settling call and at close.**
  2. Only at close.
  3. Replace the reply.
- **Catalogs:**
  1. **Missing keys in any shipped catalog fail; literals warn.**
  2. Every warning fails.
  3. Errors only.
- **Processes:**
  1. **Scripted by command, spawned for real.**
  2. No fakes.
  3. An in-memory supervisor.
- **Crashes:**
  1. **Handler points, in-process.**
  2. Every `14` §14.3 point.
  3. Step points only.

## Decision

Option 1 in each case.

**Unregistered codes**

- When a handler's invocation ends with a problem whose code is in its extension's namespace but was not registered by it, the kernel logs a warning. The record carries the extension, the message type, and the code, and no payload.
- Kernel codes (`INTERNAL` for an uncaught exception, for example) and other extensions' codes passed on from a call are not flagged. The owner's own invocation flags an unregistered code of its own.
- The test kernel collects these records. The next settling call throws a `TestkitError` that names each one:
  - `command`, `query`, `crashDuring`, `idle`, `events`, and `ui`, on both the driver and `asUser()`;
  - a call that fails for another reason reports both.
- `close()` throws for any that no call has reported yet, for example one thrown by a subscription.

**Catalogs**

- `createTestKernel` fails with a `TestkitError` when:
  - recording an extension fails (`EXT_MANIFEST_INVALID`, as at install);
  - a key the extension uses is missing from any of its shipped catalogs. ADR 0160 keeps that a warning at install; the testkit makes it an error.
- Literal-text warnings are printed with their manifest paths, and don't fail.

**Fake processes**

- `processes: { [command]: { stdout?: string[], stderr?: string[], exitCode?: number } }`.
- When a handler spawns a command that is exactly one of the keys, the kernel spawns a small Node script of the testkit instead. The script:
  - writes each `stdout` entry to stdout, then each `stderr` entry to stderr;
  - exits with `exitCode` (default 0).

  The arguments are ignored.
- Everything else about the process is real: the `process` capability, its group, tracking, `kill`, `wait`, `onExit`, its log, and its row.
- Commands not listed run for real.
- The process supervisor takes an optional command resolver (a dependency, like the host starters) that maps a requested command to what is spawned. Without one, commands spawn as requested.

**Crashes**

- `k.crashDuring(type, point, payload = {})`:
  - sends the command as `k.command` does;
  - when that message's invocation reaches `point`, stops the kernel abruptly and opens a new runtime on the same home;
  - resolves with the command's reply after the restart (a problem is thrown as a `TestkitProblem`).
- Points:
  - `before-step:<name>`: the host asked to begin the step `<name>`; it never begins.
  - `after-step:<name>`: the step's result was recorded; the host never learns it.
  - `before-commit`: the handler finished; its unit never commits.
- Stopping abruptly:
  - the host frame at the point is dropped;
  - the runtime stops without draining, so hosts end and nothing else commits (as a `SIGKILL` leaves the rows);
  - the database closes.
- The reopened runtime recovers the message like any restart: it runs again as a new attempt, and recorded steps are not repeated.
- If the invocation ends without reaching the point, `crashDuring` throws a `TestkitError` ("the point was never reached"), and the kernel is left running.

## Consequences

- The testkit exports `TestkitError`.
- The recording warnings carry an issue `code`, so the testkit can tell them apart: `TRANSLATION_MISSING` (a key missing from a non-default catalog), `LITERAL_TEXT`, and `PLACEHOLDER_DESCRIPTION` (ADR 0169).
- The kernel's unregistered-code warning moves from `ctx.problem` in the host to where the kernel receives an invocation's outcome. Its record carries `code` and `type`.
- The process supervisor and `KernelRuntime` take the optional command resolver.
- `05` §5.10 states these rules.
