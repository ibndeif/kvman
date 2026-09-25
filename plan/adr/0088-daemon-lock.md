# ADR 0088 — The daemon lock: bind first, a live owner is a conflict

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.8
- **Decided by**: the product owner

## Question

`03` §3.9 acquires `daemon.lock` at boot step 1, but `03` §3.10 records "the port actually bound", and the adapters start only at step 8. Read literally, a second daemon starting in that window finds no `/health`, treats a live lock as stale, and takes it over, so two kernels would write one database. The plan also does not say how `processStart` is measured or what format it has.

## Options

For the lock:

1. **A live PID with the same start time is a conflict; bind first.**
2. The plan as written, with a 5 s `/health` timeout before takeover.
3. Write the lock without a port and add the port at step 8.

For `processStart`:

1. **The `ps -o lstart=` string.**
2. Epoch milliseconds, measured differently on each platform.
3. The daemon's own start time only.

## Decision

- **Binding comes first.** At boot step 1 the daemon binds its port first: 4173, else the first free one in 4174–4199, or exactly `--port`. Only then does it create the lock with that port. HTTP requests, including `/health`, wait until boot finishes.
- **Creating the lock is atomic.** The record is written to a temporary file and hard-linked to `daemon.lock` (0600), so the lock never exists half-written.
- **Collision rule.** If the recorded PID is alive with the same `processStart`, the result is `DAEMON_CONFLICT`, whether or not its `/health` answers yet; `/health` only identifies the running instance. Otherwise the lock is stale. A stale lock is renamed away, checked to be the one that was read, and deleted, and the exclusive creation is retried. A record that does not parse is stale.
- **Release** removes the lock only if its nonce still matches.
- **`processStart`** is an opaque string from `ps -o lstart= -p <pid>` run with `LC_ALL=C`, for example `Thu Sep 25 10:00:00 2026`. The same command works on Linux and macOS. It is compared for equality, and the process supervisor records the same value (`03` §3.7).
- **The lock record** is `{ pid, processStart, nonce, port, startedAt }`: `nonce` is a UUID v4 and is also the `instanceId` in `/health`; `startedAt` is in epoch ms. Its schema, `daemonLockSchema`, lives in `@kvman/protocol`.

## Consequences

`03` §3.9 step 1 and `03` §3.10 are corrected.
