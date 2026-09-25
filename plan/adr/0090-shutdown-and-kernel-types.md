# ADR 0090 — `kvman stop`, `kernel.shutdown`, and requests during shutdown

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.8
- **Decided by**: the product owner

## Question

The plan does not say:

- how `kvman stop` stops the daemon;
- whether M1.8 registers `kernel.shutdown` and `kernel.health.get`;
- what a request gets when it arrives after shutdown has stopped admitting adapter messages (`03` §3.9).

## Options

For stopping:

1. **`kernel.shutdown` over HTTP.**
2. SIGTERM to the PID in the lock.
3. HTTP first, with SIGTERM as a fallback.

For requests during shutdown:

1. **A new code, `KERNEL_STOPPING`, answered with 503.**
2. Reuse `HANDLER_UNAVAILABLE`.
3. Drop the connection.

## Decision

- **Kernel types.** M1.8 registers:
  - `kernel.shutdown`: `{}` → `{}`, access `user`, run by the kernel host. Shutdown starts once its unit commits.
  - `kernel.health.get` as a kernel query. `GET /health` serves its result.
- **Stopping.** `kvman stop` finds the kernel through the lock, sends `POST /commands/kernel.shutdown`, and waits until the lock is released. SIGTERM, and SIGINT (Ctrl+C under `--foreground`), start the same shutdown.
- **Requests during shutdown.** From the start of shutdown:
  - a command, a query, or a subscription request gets 503 with `KERNEL_STOPPING` ("The kernel is shutting down", retryable);
  - `GET /health` still answers, so the listener stays open until the end of shutdown. Node closes idle keep-alive connections when a listener closes, so closing it earlier would leave nothing to answer on.
- **At close.** A request still waiting for a reply answers `202 { id, state }`, and each event stream gets `close { reason: 'shutdown' }`.

## Consequences

- `03` §3.8 lists `kernel.shutdown` and `kernel.health.get` as built in M1.8.
- `03` §3.9 describes the requests.
- `13` §13.2 and the protocol code list gain `KERNEL_STOPPING`.
