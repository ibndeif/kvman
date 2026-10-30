# QA 73 — a conversation, not a procedure (ADR 0112)

**Asked.** The owner said a kvcoder conversation feels systematic and not seamless, asked for the reasons, and then
chose a fix for each one. The answer is ADR 0112.

Paths are relative to `extensions/kvcoder/`.

## Happy path

- **QA73-H1 every reply with a call starts with a sentence.** *Then* the lead's engineering method's second line, and
  the general method's second line, start "Talk to the person as you work, the way a colleague does. Every reply that
  makes a call starts with one short sentence to the person: what you are doing and why, or what you just found and
  what you do next. Never send a reply that holds only calls." `test/unit/prompt-method.test.ts`
- **QA73-H2 the run tool says it too.** *Then* `run`'s description holds "Start each reply that makes calls with one
  short sentence saying what you are doing and why." `test/unit/prompt-steps.test.ts`
- **QA73-H3 a headline titles the calls under it.** *Given* a reply whose thinking headline is A with two calls, and
  then a reply whose headline is B with one call, *then* the rows are a fold of A's two cards titled A and a fold of
  B's one card titled B, and no row is a headline of its own. `test/web/call-folds.test.ts`
- **QA73-H4 the fold's row shows its headline first.** *Then* the fold's head shows the headline, muted and with
  `dir="auto"`, before its sentence (`Read 2 files`), and opened it shows each reply's "Thought" toggle among its
  cards. `test/web/call-folds.test.ts`
- **QA73-H5 a shorter method with fewer parts.** *Then* the lead's method names, in order, Understand, Clarify,
  Deliberate, Map, Execute, Stay on the task, Delegate, Show what the person will look at, and Finish, has no "Size up
  the task first", "Plan. ", or "Confirm the plan. ", and is shorter than before. `test/unit/prompt-lead.test.ts`
- **QA73-H6 the person's go-ahead is their agreement.** *Then* Clarify ends "The person's go-ahead (\"do it\",
  \"yes\", or the option that starts, chosen after you said what you would do) answers what it covers: never ask it
  again.", and Map says that when they already told the lead to go ahead with what the map does, it says in a few
  lines what it understood and starts, and otherwise calls `ask choice` with other set to true.
  `test/unit/prompt-method.test.ts`
- **QA73-H7 the final answer gives the result first.** *Then* the lead's Finish and the general method end their
  answer rule with "Your final answer starts with the result, in plain words and as short as the facts allow. Say what
  you couldn't check, what still runs, or what you noted for later only when it matters for what the person does
  next.", and the evidence rule no longer says "say what you checked and what you didn't".
  `test/unit/prompt-method.test.ts`
- **QA73-H8 a finished background job is one quiet line.** *Given* a job that succeeded in 41 s, *then* its ending
  shows as one line, not a card: a check mark named "Done", the call's words, and "41 s"; pressed, it shows the text
  the model read. `test/web/background-time.test.ts`
- **QA73-H9 a failed one has a cross.** *Given* a job that failed, *then* its line's mark is a cross named "Failed".
  `test/web/background-time.test.ts`
- **QA73-H10 the runs that ended while kvman was stopped are one line.** *Given* the message reporting two such runs,
  *then* it shows as one line "2 runs ended while kvman was stopped" with a plain circle, and in Arabic in the page's
  language. `test/web/background-time.test.ts`

## Edge cases

- **QA73-E1 a headline with no call card under it isn't shown.** *Given* a reply with headline A whose only call is
  housekeeping, and then a reply with text, *then* no row shows A, and A's reply keeps its "Thought" toggle.
  `test/web/call-folds.test.ts`
- **QA73-E2 without a headline one card stays a card.** *Given* replies with no headline and one call card, *then* the
  card shows on its own, and two such cards fold, as before. `test/web/call-folds.test.ts`
- **QA73-E3 the agent's text ends a group.** *Given* headline A with one call, a reply with text, and then a reply
  with no headline and one call, *then* the rows are A's fold, the text, and the last card on its own.
  `test/web/call-folds.test.ts`
- **QA73-E4 Decide for me still never asks.** *Then* with `decides` the Map part says what it understood and starts
  without waiting, and the method names no `ask`. `test/unit/prompt-method.test.ts`
- **QA73-E5 a changed map is agreed again.** *Then* Map says that a map set again with a change to what the person
  gets (the goal, what done looks like, what stays as it is, stored data, or what could go wrong) needs their
  agreement again, and a change inside the plan needs none. `test/unit/prompt-method.test.ts`
- **QA73-E6 a run the list doesn't hold.** *Given* a background ending whose run isn't among the chat's newest runs,
  *then* its line has a plain circle, the call's words, and no time. `test/web/background-time.test.ts`
- **QA73-E7 a helper's line has its run's title.** *Given* a helper that succeeded, *then* its line shows the title
  its run was given, and one with no row keeps the call's words. `test/web/background-time.test.ts`
- **QA73-E8 a worker gets no talking rule.** *Then* a worker's method has no "Every reply that makes a call starts
  with one short sentence to the person". `test/unit/prompt-method.test.ts`
- **QA73-E9 what stays.** *Then* the lead's method still holds `risky`'s rule, the check rule (QA72-H3), one round of
  questions with `ask choice` and the recommended option first, no map for a bug fix or a change to one or two files,
  Deliberate only on request, and Delegate's rules unchanged. `test/unit/prompt-build.test.ts`

## Measured after, not tested

- **QA73-M1 pace.** The silent-step share (was 70%), steps per turn (median 4), and median step time (12.7 s) are
  measured again from real chats, read-only, and reported to the owner (ADR 0112, 6).
- **QA73-M2 models.** The same task on gpt-6.1-sol and on a Claude model, in a copied kvman home, with the same three
  numbers (ADR 0112, 7).
