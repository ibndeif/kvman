# ADR 0097 — `--port` now, `--unsafe-bind` in the backlog

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.8
- **Decided by**: the product owner

## Question

`12` §12.5 and §12.8 describe `kvman start --port <n>` and `--unsafe-bind`, but no milestone lists them. The `Host` allowlist, which accepts only `127.0.0.1` and `localhost`, would also refuse every request that reached a non-loopback bind.

## Options

1. **`--port` now; `--unsafe-bind` moves to the backlog.**
2. Both now, with `--unsafe-bind` extending the `Host` allowlist.
3. Both in M7.1.

## Decision

Option 1:

- M1.8 builds `--port <n>`. It binds exactly `n` and fails with `PORT_UNAVAILABLE` `{ port }` if that port is taken; there is no fallback.
- `--unsafe-bind` moves to the backlog (`15` §15.7) until someone decides which `Host` values a non-loopback bind accepts.

## Consequences

`12` §12.8 and `15` (M1.8 and the backlog) are corrected.
