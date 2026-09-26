# ADR 0131 — The read pool

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.4
- **Decided by**: the product owner

## Question

`04` §4.1 gives sandboxed hosts' reads to "2 worker threads (configurable)" and does not say where they are configured. M2.4's Done-when says "a large `find` from a sandboxed extension does not delay a concurrent `/health` request" without a measure of delay.

## Options

- **Configuration:**
  1. **A kernel boot option only.**
  2. Also a `kvman start --read-pool-size` flag.
- **The test:**
  1. **Every `/health` answers within 25 ms.**
  2. The main thread's event-loop delay stays below 50 ms.

## Decision

Option 1 in both cases.

- The read pool size is the kernel option `readPoolSize` (default 2, at least 1). There is no CLI flag or setting.
- A sandboxed host reads with the `store.read` call. The kernel sets the owner (the invocation's extension) and the workspace (the invocation's, or none for `global`) itself, never from the frame. The read runs on a pool thread, which also serializes the result, so the main thread only forwards bytes to the host's pipe. Pool threads start lazily.
- Shared and dedicated hosts read through their own connections, so a `store.read` call from one of them fails `CAPABILITY_DENIED`.
- **The test.** While a sandboxed handler's `find` returns 5,000 documents of about 3 KB each (about 15 MB), `/health` is requested every 10 ms. Every request answers within 25 ms (the p99 no-op command target of `14` §14.6), and the find returns all 5,000.

## Consequences

- `04` §4.1 names the option.
- A wall-clock check cannot hold while dozens of test files load every core, so the test lives in a `*.timing.test.ts` file. Vitest runs those after every other test, one file at a time (`vitest.config.ts`). The rule itself is unchanged.
- The `rpc` call list of `03` §3.5 already names `store.read`; its shape is added to `@kvman/protocol` (ADR 0076).
