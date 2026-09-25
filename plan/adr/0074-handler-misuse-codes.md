# ADR 0074 — Error codes for handler misuse, and host-side schema checks

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.6
- **Decided by**: the product owner

## Question

The plan names restrictions on handlers without codes: queries "cannot send commands or publish events", `ctx.live` only for own live events, `defer` for commands, `ctx.reply` only by the same extension, unregistered problem codes "delivered as they are". It also leaves open when the host checks inputs and outputs with Zod (`05` §5.12; M2.1's Done-when tests `.refine()`).

## Options

1. **This table, with input and output checks now.**
2. The table, with both checks in M2.1.

## Decision

Option 1:

| Misuse | Code |
|---|---|
| In a query: `send`, `publish`, `command`, `live`, `defer`, `reply`, `step` (`query` is allowed) | `CAPABILITY_DENIED` |
| `ctx.live` of anything but one of its own live events | `CAPABILITY_DENIED` |
| `ctx.live` chunk not of the event's declared shape | `VALIDATION_FAILED` |
| `defer` outside a command handler; `onAbort` not an own internal command | `VALIDATION_FAILED` |
| `ctx.reply` to a command of another extension (at commit) | `CAPABILITY_DENIED` |
| `ctx.reply` to a command that is not `awaiting` (at commit) | `REPLY_NOT_AWAITING` |
| A handler's input fails its full Zod schema in the host | `VALIDATION_FAILED`, not retried |
| A command's result fails its `output` schema | `VALIDATION_FAILED`, not retried |
| Any thrown value that is not a `ProblemError` | `INTERNAL`, retryable |

- `ctx.problem(code)` with a code the extension registered takes its title, hint, and retryable from the registration. A code of its namespace that it never registered is delivered with `title` equal to the code and `retryable: false`, and logged as a warning (`13` §13.1).
- A thrown `ProblemError` passes through as it is, so a caller may rethrow what `ctx.command` rejected with.
- A failure at commit (`REPLY_NOT_AWAITING`, a refused send or publish, `CAPABILITY_DENIED`) rolls the unit back and fails the invocation with that problem, not retried (`04` §4.2).

## Consequences

`05` §5.4 and `05` §5.12 are corrected.
