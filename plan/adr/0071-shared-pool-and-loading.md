# ADR 0071 — Shared pool placement and module loading

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.6
- **Decided by**: the product owner

## Question

`03` §3.5 sizes the shared pool at `min(4, cores-1)` threads with 64 in-flight invocations per worker, "each loads shared extensions lazily", but does not say which worker runs an invocation. Before M2.2's snapshots there is no stored package to load, and the plan does not say what a `setup` mismatch does before quarantine exists (M1.7).

## Options

1. **Least-loaded worker**, or 2. pinned per extension.
And: **entry path as data** with a non-retryable `EXT_MANIFEST_INVALID`, or a retryable mismatch.

## Decision

- Any worker may load any shared extension. Each invocation goes to the worker with the fewest in-flight invocations, preferring on a tie a worker that already loaded the extension. Workers start lazily up to the pool size, which is at least 1. The dispatcher reports that worker's `{ inFlight, cap: 64 }` (ADR 0060).
- Until M2.2, the host manager is given each extension's entry module path as data (like grants, ADR 0052). A worker imports it, re-runs `setup` with a binding `ext`, and compares the recorded manifest with the registry's. A mismatch fails the load with `EXT_MANIFEST_INVALID`: the invocation fails without retry, and the extension is not loaded on that worker. M1.7 adds quarantine.

## Consequences

`03` §3.5 is corrected.
