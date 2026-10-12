# ADR 0050 — clearer model failures, a Retry that adds no message, and a helper's reason

Status: accepted by the product owner by choice on 2026-10-12, before source. This records KVC-35 to KVC-39, found while the owner used kvman for the kvcoder fix campaign.

## Decisions

1. **A cut stream is temporary (KVC-36).** A provider failure whose text says the stream ended is `transient`, like a dropped connection, so kvcoder's existing four tries apply unchanged (ADR 0009, 203). The partial reply is discarded.
2. **Two new kvai error codes (KVC-35, KVC-38).**
   - `kvai/USAGE_LIMIT { model }`: the account reached its usage or quota limit. Recognised from the provider's text (a usage limit, `insufficient_quota`, or an exceeded quota), before the rate-limit check.
   - `kvai/REFUSED { model }`: the provider declined the request for its content. Recognised from the provider's text (flagged content, a content policy or filter, a safety system).
   Neither is retried automatically, and neither carries the provider's text. Each has its own sentence in English and Arabic that points to choosing another model. The provider library gives no reset time, so none is shown.
3. **Retry adds no message (KVC-37).** This replaces "no new command" in ADR 0009, 204. `kvcoder.turn.retry { sessionId }` → `{}` is for the person only. It starts a new turn on the session's history as it stands, and adds no message. It runs only when the session is idle and its last message is a notice `STEP_FAILED`, `REPLY_LOST`, or `INTERRUPTED`; otherwise it fails `VALIDATION_FAILED`. It sends the `follow` chunk as a send does. "Retry" calls it, and "Choose another model" calls it after setting the model. The translated "Continue" text is removed.
4. **A helper says why it stopped (KVC-39).** A child that doesn't end `done` returns, as an error: `subagent ended <outcome>`, followed by `: <code>` when its last message is a notice that carries a failure's code, then the provider's reason on the next line when the notice has one, then, when the child has a last answer, a blank line, the line `Its last message before it stopped (unfinished, not a result):`, and that text. This changes plan 08 §8.3.

## Verification

Scenarios M2.4-E146 to E151, written before source.
