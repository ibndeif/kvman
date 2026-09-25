# ADR 0101 — Live previews after a kernel crash

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M1.9
- **Decided by**: the product owner

## Question

Invariant 8 of `14` §14.3 says every live-event run published by an attempt that did not commit receives `{ reset: true }` (`02` §2.3).

When the kernel process itself is killed, its live rings, chunk counters, and the invocation's published addresses all disappear with it. The plan does not say what the reset is in that case.

## Options

1. **The restart is the reset.** Live state is memory only, so nothing from the dead attempt survives. The shell drops its previews when it re-creates a live subscription.
2. **Durable live-run records.** The first live publish of an attempt to an address writes a row, and recovery publishes `{ reset: true }` for every recovered message into the new rings. This means a new table, and one write per address outside the unit of work.

## Decision

Option 1.

- **After a restart:**
  - the rings are empty;
  - the chunk counters start again at 1;
  - `hello.subscriptions` lists no subscription.
- **The shell rule.** When the shell re-creates a live subscription that `hello` did not list, it discards what it received for that address, as it does for a gap in `n`. A retry of the interrupted message publishes under the same `run` from the beginning.
- **Resets inside a running kernel stay as they are.** When an attempt ends without committing, the kernel still publishes `{ reset: true }` on every address it used. That covers a timeout, a failure, a retry, a cancel, a host loss, and a shutdown (ADRs 0074, 0091).

## Consequences

- **What M1.9 checks at `live.after-publish-before-commit`.** After the restart:
  - a new stream's `hello` lists no subscription;
  - the address's ring holds no chunk of the dead attempt;
  - the retried attempt publishes under the same `run`, starting from `n = 1`.
- **Plan corrections:** `02` §2.3 and `12` §12.3.
