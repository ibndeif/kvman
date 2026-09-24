# ADR 0058 — Admission details

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.4
- **Decided by**: the product owner

## Question

Four admission cases have no rule: a message whose kind differs from its type's kind, an invalid `onReply` target (`06` §6.3 gives no code), a send with both `delayMs` and `at`, and which id a new correlation gets.

## Options

- Kind mismatch: **`TYPE_NOT_FOUND`** or `VALIDATION_FAILED`.
- Invalid `onReply` target: **`VALIDATION_FAILED`** or `CALLER_NOT_ALLOWED`.
- `delayMs` and `at`: **`VALIDATION_FAILED`** or the later one wins.
- New correlation: **the message's own id** or a separate ULID.

## Decision

- A kind mismatch (`ctx.send` to a query, `ctx.query` to a command, `ctx.publish` of a command) fails `TYPE_NOT_FOUND`, with a detail naming the type's real kind.
- An `onReply.type` that is not one of the sender's own `internal` commands fails `VALIDATION_FAILED` at `onReply.type`, with the hint "a continuation is one of your own internal commands"; no continuation is attempted, so the unit is rejected.
- A send with both `delayMs` and `at` fails `VALIDATION_FAILED`.
- A message that starts a correlation has `correlationId` equal to its own `id`.
- In a lane template only an absent path renders as `-`; a path whose value is `null`, a boolean, an object, or an array fails `VALIDATION_FAILED` at that path (a follow-up answer).

## Consequences

`02` §2.2, §2.10 and `03` §3.3 state these rules.
