# ADR 0095 — `NOT_FOUND` and `PORT_UNAVAILABLE`

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.8
- **Decided by**: the product owner

## Question

Two failures have no code in the catalog (`13` §13.2):

- an unknown message id or route, answered with 404;
- no free port, when all of 4173–4199 are taken or the port given with `--port` is taken.

## Options

1. **`NOT_FOUND` and `PORT_UNAVAILABLE`.**
2. `MESSAGE_NOT_FOUND`, `ROUTE_NOT_FOUND`, and `PORT_UNAVAILABLE`.
3. `MESSAGE_NOT_FOUND` only.

## Decision

Option 1:

- **`NOT_FOUND`**, "The resource does not exist", not retryable: `GET /messages/:id` for an unknown id, an unknown route, and a subscription request for a stream that is not connected (ADR 0098).
- **`PORT_UNAVAILABLE`**, "No port is free for the kernel", not retryable. Its params are `{ from: 4173, to: 4199 }`, or `{ port }` for `--port`.

## Consequences

`13` §13.2 and `kernelErrorCodes` in `@kvman/protocol` gain both codes.
