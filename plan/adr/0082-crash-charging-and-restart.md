# ADR 0082 — Charging host crashes, and restarting workers

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.7
- **Decided by**: the product owner

## Question

`03` §3.6 releases every in-flight invocation of a crashed host with attempt+1 and quarantines an extension "charged with 3 host crashes or stuck invocations within 10 minutes". A shared worker may run several extensions when it dies. The plan also says "the host restarts immediately", while M1.6 replaces a worker lazily, and ADR 0067 mentioned a "restart backoff" that the plan never names.

## Options

Charging: **every extension running on the dead worker**, or only when a single extension ran there. Restart: **lazy, no backoff**, or eager.

## Decision

- Each extension with an invocation running on a worker that exits is charged one host failure, and each of those attempts counts (attempt+1). A shared worker cannot tell which handler caused its death. An extension that crashes often isolates itself by quarantine; dedicated and sandboxed hosts (M2.4) avoid collateral.
- Three charges within 10 minutes quarantine the extension with `HOST_FAILURES` (ADR 0080).
- A new worker starts on the next dispatch that needs one: immediately while work waits, and at no cost while idle. There is no restart backoff; quarantine is the protection against a crash loop. ADR 0067's mention of a backoff is corrected.

## Consequences

`03` §3.6 and ADR 0067 are corrected.
