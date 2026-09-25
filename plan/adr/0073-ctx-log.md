# ADR 0073 — `ctx.log`

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.6
- **Decided by**: the product owner

## Question

`ctx.log` is a `Logger` "structured, redacted, correlation attached" (`05` §5.4, `13` §13.3) with no stated shape, and Pino and the log file arrive with the daemon (M1.8).

## Options

1. **The shape and a kernel sink now**; M1.8 backs the sink with Pino.
2. Add Pino now.

## Decision

Option 1:

- `ctx.log.debug | info | warn | error(message: string, fields?: Record<string, Json>)`.
- Each line travels to the kernel as a `log` frame; the kernel attaches `correlationId`, `messageId`, `type`, `extension`, `workspaceId`, and `attempt` and passes it to a kernel `Logger` interface. M1.8 implements the interface with Pino writing `~/.kvman/logs/kernel.log`.
- Redaction masks fields whose name matches `password`, `token`, `secret`, `apiKey`, or `authorization` (any case, any depth), bearer tokens, and credentials in URLs, in both the message and the fields.

## Consequences

`05` §5.4 and `13` §13.3 are corrected.
