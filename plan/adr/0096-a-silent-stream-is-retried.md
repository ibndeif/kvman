# ADR 0096 — a silent stream is retried after 5 minutes

Status: accepted by the product owner on 2026-10-20 (the recommended option). It amends plan 07 §7.1 and settles the
cut-off ADR 0094, 2 left to a later ADR.

## Context

ADR 0094, 2 had kvai log each call's time to its first stream event and its longest gap, so a cut-off could be chosen
from a week of real use. Those logs don't exist yet: the installed kvman (0.4.4) predates the measurement. The owner's
database (7,087 model calls, 2026-10-07 to 2026-10-20) gives instead:

- A call's whole duration: p50 12 s, p99 169 s, p99.9 333 s; the longest real call took 481 s and wrote 13.7k tokens.
  A thinking model may be silent while it reasons, for a time no stored number shows.
- No step ever failed on the 600 s job timeout. The longest call (6.7 h) spanned the laptop's suspend, when timers
  don't run; one call took 325 s for 569 tokens.
- The dropped streams and connection errors that ended turns all came before ADRs 0050 and 0069 made them temporary.

So a dead stream is rare, and when one happens it holds the step until the job's 600 s timeout and then ends the turn
with `TIMEOUT`, which isn't retried.

## Decision

**One 5-minute rule** (asked; recommended). A model call whose stream has had no event for 300 s, before its first
event or between two, is aborted and fails `kvai/PROVIDER_ERROR { model, reason: "stream stalled", transient: true }`,
so the step's retries take it (ADR 0009, 154). 300 s is half the job's 600 s timeout, so a dead stream is retried
within it, and above every silence the stored calls could hold but the longest few. A cancel of the job stays a cancel.
The timer ends with the call. The silence logs stay, so a later ADR can tighten the rule from real numbers.

The other options were a second, 120 s cut-off once output had started (it could cut a model that thinks again between
tool calls), waiting a week for the logs, and retrying `TIMEOUT` in kvcoder (a dead stream would still hold each try
for 10 minutes).

## Consequences

- A stream that dies without closing is retried after 5 minutes instead of ending the turn after 10.
- A model that is silent for more than 5 minutes while it reasons is cut and retried; the logs will show if this
  happens.
