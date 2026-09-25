# ADR 0078 — Kernel commands run in an in-process kernel host

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.7
- **Decided by**: the product owner

## Question

`kernel.cancel` is the first kernel-owned command (ADR 0061 registered only a kernel event). How does the kernel handle its own commands?

## Options

1. **An in-process kernel host** on the one dispatch path.
2. Act inside the admitting transaction, with no scheduling.

## Decision

Option 1. A kernel command gets an inbox row and goes through the scheduler like any command. The dispatcher sends a message whose handler is the kernel to an in-process kernel host on the main thread. That host runs the kernel's own function (kernel code, never extension code) and commits its unit through the commit pipeline. Replies, idempotency, retries, and waiters work unchanged.

## Consequences

`03` §3.8 states it.
