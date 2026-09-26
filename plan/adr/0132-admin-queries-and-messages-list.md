# ADR 0132 — Admin-only queries and `kernel.messages.list`

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.4
- **Decided by**: the product owner

## Question

M2.4's Build lists "admin-only queries", but none of the admin queries of `03` §3.8 exist yet:

- `kernel.messages.list`;
- `kernel.notifications.list` (M2.12);
- `kernel.dev.file.get` and `kernel.dev.files.list` (the builder);
- `kernel.trace.get` with `reveal`;
- `kernel.processes.list` for other extensions (M2.6).

The plan does not give `kernel.messages.list`'s item shape.

## Options

1. **Build `kernel.messages.list` now, items without payload or result.**
2. The same, with `payload` and `result`.
3. No admin query now; each one brings the rule with its milestone.

## Decision

Option 1.

**The rule.** A kernel query marked admin in `03` §3.8 answers only an administrator: a person, the kernel, or an extension granted `kernel.admin` where the query runs (ADRs 0079, 0118). Anyone else gets `CAPABILITY_DENIED`, a process included. The check runs in the kernel's query handler, as for admin commands.

**`kernel.messages.list`** `{ state?, type?, extension?, workspaceId?, correlationId?, limit? }` → `{ items, total }`:

- It lists stored messages (commands and durable event deliveries), newest first (by `seq`).
- `type` and `correlationId` match exactly. `extension` matches the handling extension, including its event deliveries. `state` is one of the message states of `04` §4.1.
- `limit` defaults to 200, and at most 1,000 is allowed (`VALIDATION_FAILED` above that). `total` counts every match.
- Each item holds the message's metadata without payload or result: `id`, `kind`, `type`, `state`, `source`, `handler`, `workspaceId?`, `lane?`, `priority`, `attempts`, `correlationId`, `causationId?`, `createdAt`, `updatedAt`, `deadlineAt?`, `notBefore?`.
- Payloads stay reachable only through the trace with `reveal`.

## Consequences

`03` §3.8's `kernel.messages.list` row names the item fields.
