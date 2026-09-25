# ADR 0072 — The shape of `ctx.command`

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.6
- **Decided by**: the product owner

## Question

`ctx.command`'s derived key is `<invocationMessageId>:command:<stepName>` (`02` §2.7), but `ctx.command(type, payload, opts?)` takes no name, `opts` is not specified, and the nested depth limit (8, `02` §2.13) has no error code.

## Options

1. **Ordinal name, send's options**, depth later.
2. An optional `step` name.
3. Enforce depth now with `VALIDATION_FAILED`.

## Decision

Option 1:

- stepName is the call's 1-based ordinal among the invocation's `ctx.command` calls: `<id>:command:1`, `<id>:command:2`.
- `opts` is `{ lane?, priority?, deadlineAt?, context?, idempotencyKey? }` (send's options without `onReply`, `delayMs`, `at`); an explicit `idempotencyKey` replaces the derived key.
- The command is admitted and committed at once (standalone transaction, sender the calling extension, caused by the invocation's message). A redelivery re-admits the same key and gets the original message and, if present, its stored reply, so nothing is sent twice.
- It resolves with the reply's value and rejects with a `ProblemError` carrying the reply's problem. `LANE_REENTRANT` fails the call before anything is stored.
- The depth limit arrives with M1.7, which asks for its code.

## Consequences

`05` §5.4 is corrected.
