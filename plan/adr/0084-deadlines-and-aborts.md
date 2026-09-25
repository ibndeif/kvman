# ADR 0084 — Deadlines end attempts at once; aborts close ctx

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.7
- **Decided by**: the product owner

## Question

`03` §3.4 fires the signal at the invocation deadline and treats the host as stuck after a 2 s grace, but does not say when the attempt ends. `03` §3.5 names `abort {invocationId, reason}`, `ctx.signal`, and `ctx.deadlineAt`, but not the reasons or what `ctx` does after an abort.

## Options

1. **End the attempt at the deadline; a signal plus a closed ctx.**
2. End it when the handler settles; ctx stays open.

## Decision

- **The invocation deadline:** `invoke` carries `deadlineAt`, set to `min(message deadlineAt, claim + timeoutMs)`, and `ctx.deadlineAt` exposes it. Default timeouts: command 60 s, event handler 30 s, query 5 s.
- **When it passes:** the kernel sends `abort { invocationId, reason }` and ends the attempt at once:
  - `DEADLINE_EXCEEDED` (final) if the message deadline was reached;
  - otherwise `HANDLER_TIMEOUT` (retryable, counted), or `QUERY_TIMEOUT` for a query (never retried).
  Its live events are reset, and a later `complete` or `rpc` is refused or discarded.
- **Abort reasons:** `'cancelled' | 'deadline' | 'timeout'`. The abort fires `ctx.signal` with a `ProblemError` reason (`CANCELLED`, `DEADLINE_EXCEEDED`, `HANDLER_TIMEOUT`, or `QUERY_TIMEOUT`). From then on, every `ctx` call throws that problem in the host.
- **A stuck host:** an invocation that has not settled 2 s after its abort makes its worker stuck, and the worker is stopped.
  - The stuck invocation's extension is charged one host failure; its attempt was already counted.
  - Every other invocation on that worker returns to pending without an attempt penalty (`03` §3.6).
- **Other deadlines:**
  - A pending message whose `deadlineAt` passes fails `DEADLINE_EXCEEDED` from the timer wheel. Its waiters are answered and its continuation is sent.
  - An awaiting command does the same and also sends `onAbort { commandId, reason: 'deadline' }`.
  - At commit, a unit whose invocation was cancelled or ended is discarded (`04` §4.2).

## Consequences

`03` §3.4 and §3.5 are corrected.
