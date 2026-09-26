# ADR 0135 — Payload, result, and event spill in M2.5

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.5
- **Decided by**: the product owner

## Question

ADR 0055 says M2.5 adds the spill of payloads over 256 KB to `payload_ref`, and `02` §2.2 spills command results over 256 KB too, but M2.5's Build list (`15` §15.4) does not name it. The durable `events` log (`04` §4.1) has `payload` and no ref column.

## Options

- **When:** 1. **in M2.5, as ADR 0055 says**; 2. a later milestone.
- **Durable events:** 1. **spill them too, with `events.payload_ref`**; 2. cap event payloads at 256 KB; 3. keep them inline up to 16 MB.

## Decision

Option 1 in both cases.

- A message payload, a command result, or a durable event payload whose canonical JSON is over 256 KB is written as a blob, and its row stores the blob ID in `payload_ref` or `result_ref` (`payload` or `result` stays `NULL`). Over 16 MB still fails `PAYLOAD_TOO_LARGE { limit: 'payload', max: 16777216 }`.
- The kernel owns these blobs: their references have the owner `kernel` and the refs `payload:<messageId>`, `result:<messageId>`, and `event:<eventId>`. They are added in the same transaction as the row and deleted with it (retention, workspace forget).
- Every reader reads the blob back transparently: delivery to a host, replies to waiters and HTTP, `GET /messages/:id`, SSE delivery and resume.
- Kernel schema 3 adds `events.payload_ref`.

## Consequences

`15` §15.4 M2.5 names the spill; `02` §2.2 and `04` §4.1 are corrected.
