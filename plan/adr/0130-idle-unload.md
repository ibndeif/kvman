# ADR 0130 — Idle unload

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.4
- **Decided by**: the product owner

## Question

`03` §3.5 says dedicated and sandboxed hosts stop after 10 minutes without messages, and "shared workers drop extension modules idle for 10 minutes". Node cannot unload an ES module once imported, so a shared worker frees an extension's memory only by exiting.

## Options

1. **A shared worker exits once everything it loaded has been idle for 10 minutes.**
2. A shared worker that holds any extension idle for 10 minutes drains and is replaced.

## Decision

Option 1. Every host (shared worker, dedicated worker, sandboxed process) stops once it has had no invocation for 10 minutes: no invocation in flight, and none started or ended during that time. For a shared worker, that is exactly when all the extensions it loaded have been idle for 10 minutes. The next invocation that needs the host starts a new one.

- Stopping an idle host is not a crash: nothing is charged and nothing is redelivered.
- The 10 minutes run on the kernel's timers, so tests move a fake clock.

## Consequences

`03` §3.5 "Idle unload" is corrected to say this.
