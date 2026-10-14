# ADR 0079 — a failed call reads as a short reason, not its raw input

Status: accepted by the product owner by choice on 2026-10-14, before source. It amends ADR 0013 (1), ADR 0017 (2), ADR 0036 (5), and plan 08 §8.7.

## Context

The owner showed two failed call cards and wrote: "the failed tool calls shows it's raw input and this is not good for user experience". A failed card started open and showed the raw error (`error VALIDATION_FAILED: steps.0.description: Too big…`) and every field of the payload. A question the person dismissed showed as a red "Failed" card with the question's fields.

## Decisions

1. **A failed card starts closed, with a short reason** (asked; chosen over open with the error only, and over only starting closed). Under its closed line it shows one reason: "You denied this call." for a denial, "The command failed." for a line in the shell or a binary, and otherwise the first line of the connector's error after `error <CODE>:`, cut at 160 characters. Opened, a failed call that isn't a line shows only "Show details", which shows the raw error and then the request; a failed line still shows its line and output. The reason of a line names no exit code, since a card has no exit chip (ADR 0017, 2).
2. **The agent's own mistakes are quiet** (asked; chosen over showing them like other failures, and over hiding them). A call that failed `VALIDATION_FAILED`, which is a payload that isn't valid or a connector that doesn't exist, has no danger border and the chip "Not run" instead of "Failed", and its muted reason is "The agent's request wasn't valid, so nothing ran." Other failures (a connector's error, a failed line, a denial, a timeout) stay red. An unknown command of a connector fails `NOT_FOUND`, which also means a missing file, so it stays red.
3. **A dismissed question is an answered card** (asked; chosen over a Failed card with no fields). The `ask` result "dismissed by the user", which is stored as failed, shows as the answered card with "Skipped", like a Skip.

## Verification

Scenarios M2.4-E303 to E306 (`extensions/kvcoder/test/web/call-failure.test.ts`, `answered-card.test.ts`); QA48-E5 and E6 now expect the card closed.
