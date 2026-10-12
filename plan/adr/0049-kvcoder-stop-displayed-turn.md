# ADR 0049 — Stop for every unfinished turn, tied to the displayed turn

Status: accepted by the product owner by choice on 2026-10-12, before source. This records the KVC-21 contracts.

## Decisions

1. `kvcoder.turn.cancel` takes an optional `turnId`. With it, the command cancels only when that turn is the session's current one, checked in the transaction that ends the turn; otherwise it does nothing and returns `{}`, because the turn the person meant has already ended. Without `turnId` it behaves as before. No new error code and no new output.
2. The conversation shows Stop for every unfinished turn: while a step runs, and while the turn waits on a question, an approval, a subagent, or a program worker. It sends the displayed turn's id.
3. Stop acts at once, with no confirmation. Until the cancel is confirmed the button is disabled and reads "Stopping…". A failure shows one line above the send box with what failed, and Stop can be pressed again. A reply that arrives after the person opened another chat changes nothing there.
4. While the turn waits, the hint under its cards also says what Stop does: it ends the turn and its helpers stop too. When the chat has running background jobs, it adds that they keep running. Stop deletes nothing and undoes nothing.
5. No selective cancel (one question, one helper) is added.

## Verification

Scenarios M2.4-E142 to E145, written before source: native cases for the current, ended, and replaced turn; mounted components for the button's states, the hint, and the late reply; one real Chromium run that stops a turn waiting on a question.
