# ADR 0070 — Recorded ids and times, and kernel schema version 2

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.6
- **Decided by**: the product owner

## Question

`ctx.ids.new()` and `ctx.now()` "are recorded per invocation so a redelivered handler generates the same IDs and times" (`05` §5.4), but the host RPC list of `03` §3.5 has no call that records them, and the kernel schema (`04` §4.1) has no place for them nor for a deferred command's `onAbort` (ADR 0066).

## Options

1. **Record with the journal**: buffer values in the host and store them with the next journaled write.
2. Commit every call on its own.
3. Derive ids from the message id and freeze `now()`.

For storage: a kernel schema version 2 migration, editing version 1 in place, or reserved names in `steps`.

## Decision

Option 1, stored by a kernel schema version 2 migration:

- The host numbers each kind's calls per message (1, 2, …). A redelivered invocation first returns the stored values in order, then generates new ones.
- New values are buffered and sent with the next journaled write: a `step.begin`, a `ctx.command` send, or the end of an attempt that does not commit (retryable failure). A committed unit ends the message, so its values need no record. A run that died before any journaled write showed its values only in live events, which are reset (`02` §2.3), so generating them again is safe.
- Migration 2 adds `messages.on_abort TEXT` and `recorded_values(message_id TEXT, kind TEXT ('id' | 'now'), n INTEGER, value TEXT, PRIMARY KEY(message_id, kind, n))`.

## Consequences

`04` §4.1 and `05` §5.4 are corrected; retention (later) deletes `recorded_values` rows with their message.
