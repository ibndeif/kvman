# ADR 0094 — Command replies over HTTP and the status of each problem

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.8
- **Decided by**: the product owner

## Question

`12` §12.2 says `200 { id, reply }` and lists statuses 400, 403, 404, 409, 413, 422, and 503. It does not say:

- whether `reply` is the value or the whole `ReplyPayload`;
- how a failed reply is answered;
- which code maps to which status;
- which status `INTERNAL` gets.

## Options

1. **The value in 200, a failed reply as a Problem with its status.**
2. The `ReplyPayload` in every 200.
3. The value in 200, and 422 for every failed reply.

## Decision

Option 1:

- **Commands.** A success answers `200 { id, reply }`, where `reply` is the handler's value. A failed reply answers the Problem envelope, with `messageId` set and the status from the table below. Admission refusals and edge refusals use the same table.
- **`GET /messages/:id`** answers `{ id, type, state, reply?, problem? }`: `reply` is the value of a successful reply, and `problem` is the Problem of a failed one.
- **Queries** answer `200 { data }` or the Problem.

| Status | Codes |
|---|---|
| 400 | `VALIDATION_FAILED` (also a missing JSON `Content-Type`, an unparsable body, or a bad header) |
| 403 | `CAPABILITY_DENIED`, `CALLER_NOT_ALLOWED`, `HOST_FORBIDDEN` (also a refused `Sec-Fetch-Site`) |
| 404 | `TYPE_NOT_FOUND`, `NOT_FOUND` |
| 409 | `IDEMPOTENCY_MISMATCH`, `STORAGE_CONFLICT`, every `*_STALE`, every `*_CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE`, `BLOB_TOO_LARGE` |
| 500 | `INTERNAL` |
| 503 | `HANDLER_UNAVAILABLE`, `STORAGE_UNAVAILABLE`, `KERNEL_STOPPING` |
| 422 | every other code: extension codes, `DEADLINE_EXCEEDED`, `CANCELLED`, `MESSAGE_DEAD`, `HANDLER_TIMEOUT`, `QUERY_TIMEOUT`, `LANE_REENTRANT`, … |

## Consequences

`12` §12.2 holds the table and adds 500.
