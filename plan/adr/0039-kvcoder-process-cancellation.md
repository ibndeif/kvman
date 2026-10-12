# ADR 0039 — kvcoder process cancellation boundaries

Status: accepted, 2026-10-09. The product owner selected KVC-08's protection of the existing runners, then authorized execution and confirmed the staged execution plan. The decision ledger is `docs/reviews/kvcoder-issues-and-improvements-2026-10-09.md`; this ADR records the first independent implementation batch, not completion of the other selected fixes.

## Decisions

1. **Keep the existing runners.** Protect `runShell` and `runProgram`, including the latter's installation checks; do not add a universal process layer.
2. **Prevent creation after pre-cancellation.** Check the job's signal before preparation and immediately before spawning the actual command. A pre-aborted call creates no process, rather than starting one and killing it.
3. **Close the registration window.** Install child terminal handlers and cancellation tracking, then recheck the signal. Cancellation that happened during spawn or listener registration kills the created child's tree once; it cannot be missed.
4. **Settle after shutdown.** Cancellation of an already-created child kills its tree using the existing OS-specific mechanism and waits for the child's terminal event. Reuse the signal's cancellation reason, as the job layer and existing kvai paths do; do not report ordinary command failure, startup failure, or timeout instead of cancellation.
5. **Own cleanup.** Every terminal path clears its timeout, shell-drain timer where applicable, and abort listener. Error and subsequent close events must not settle the call twice or install work after settlement.
6. **Preserve the existing contracts.** Normal output, output caps, exit codes, program answer parsing, shell/program timeouts, process groups, Windows taskkill, and shell's bounded output draining remain as specified. No new input/output fields, commands, settings, dependencies, or stored data are introduced.
7. **Preserve the review boundaries.** This does not change the approval policy retained under KVC-11, general task limits excluded under KVC-18, remembered-model behavior, responsiveness, or the long-lived process service. Existing limitations for processes outside a short-lived shell's group remain explicit; this is not system-wide isolation.

## Verification

Before implementation, extend the existing M2.4 scenario file with E65–E74 and map them to `extensions/kvcoder/test/unit/process-cancellation.test.ts`. Drive spawn and event boundaries deterministically using dependency mocks, controlled children and fake timers; no production fault hooks or timing sleeps. Regression checks exercise existing real shell and worker-run paths in isolated test homes. The local gates remain typecheck, lint, test, build and bench:check; no new release CI test gate.

Tests on the current OS are not proof of native execution on the other platforms. The existing OS-branch tests remain, and unchecked native platforms must be reported.

## Specification changes

Plan08 §8.3 and §8.5 clarify cancellation before process creation, the registration recheck, shutdown settlement and resource cleanup. The specification index points to the actual historical ADR0010 filename without renaming it. Add an `@kvman/kvcoder` patch changeset once this implementation is verified. No version bump, staging, commit, push or publication is part of this work.
