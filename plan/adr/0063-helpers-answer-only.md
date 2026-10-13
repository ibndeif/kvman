# ADR 0063 — a helper answers the lead only: no artifact of its own, and no question to the person

Status: accepted by the product owner by choice on 2026-10-12, before source. It amends ADR 0021 (the `ui-ux` worker's instructions, and "`ask` always is"), ADR 0022, 3 (the worker's method), and ADR 0056, 3 and 4 (a read-only helper's report as an artifact).

## Context

A helper's final answer already returns to the lead as the call's result. But a helper also had the `artifact` connector, and its prompt told it to use it: in two of the owner's chats, 7 of 15 and 8 of 12 helpers wrote an artifact, which the person saw as if the lead had written it and which the lead then read back with `artifact get`. A helper also always had `ask`, so it could put a question to the person. The owner's rule is that an artifact is for the person, and that the lead is the only agent that talks to the person.

## Decisions

1. **A helper writes no artifact** (asked; chosen over keeping artifacts, and over a prompt rule alone). In a child session `artifact write` and `artifact edit` are refused when they are evaluated, `VALIDATION_FAILED` with "A helper writes no artifact: return it in your answer, and the lead agent shows the person what is worth showing.", and are left out of its prompt. `artifact get` stays: a brief may name an artifact to read.
2. **A helper asks the person nothing** (asked; chosen over keeping `ask`). `ask` is never a connector of a child session, as `delegate` never is. A helper that is blocked returns its question in its answer, and the lead asks.
3. **Approvals are unchanged.** A helper's call that needs the person's approval still asks: that is permission, not conversation.
4. **The answer has a fixed shape.** The worker's method ends with: the last reply is the only thing the lead reads, under the headings Result, Evidence, Files changed, Unchecked, and Questions. Its `artifacts` and `asking` rules are gone.
5. **The words that pointed at artifacts change.** The read-only note says "you report your findings in your answer". The shipped `ui-ux` worker's instructions end "Return the design in your answer: each screen's layout, states, and wording, and a page's HTML when layout matters." in place of "Show the design in an artifact, as a page when layout matters."
6. **The lead is told.** Its delegate step says that a worker can't ask the person or write an artifact, and that its questions and anything worth showing come back in its answer.

## Limits

A workspace whose `kvcoder.delegate.workers` was saved keeps its own `ui-ux` instructions; a helper that follows the old words is refused by decision 1 and told to answer instead. A child that was already waiting on a question of its own when kvman is updated keeps that question.

## Verification

Scenarios M2.4-E214 to E217, written before source.
