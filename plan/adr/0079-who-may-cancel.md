# ADR 0079 — Who may cancel

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.7
- **Decided by**: the product owner

## Question

`02` §2.9 allows "the user, `kernel.admin`, and any actor for messages it sent itself or whose correlation it started"; `03` §3.8's Who column says "any for its own messages; admin otherwise" and "extensions need no capability". The router, however, requires a `calls` grant for any foreign type, `kernel.*` included. What does a refused cancel return?

## Options

1. **Checked when it runs, all-or-nothing**, refused with `CAPABILITY_DENIED`.
2. Filter the scope to what the actor may cancel.
3. The same rule, refused with `CALLER_NOT_ALLOWED`.

## Decision

Option 1:

- `kernel.*` types skip the `calls` check; each applies its own Who rule (`03` §3.8).
- `kernel.cancel` is allowed for a person, the kernel, and an extension granted `kernel.admin` (grants as data until M2.4). Any other actor may cancel only when it is the source of the named message (`{ messageId }`) or of the correlation's root message (`{ correlationId }`). An extension's source covers messages sent by any of its handlers and its processes.
- Otherwise it fails `CAPABILITY_DENIED` and cancels nothing.

## Consequences

`02` §2.9 and `03` §3.3 step 4 are corrected.
