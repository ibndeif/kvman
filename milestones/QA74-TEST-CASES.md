# QA 74 — helpers that finish, answers that cover the request (ADR 0113)

**Asked.** The owner asked for a review of the bilingual textbook reader chat, then chose a fix for each finding. The
answer is ADR 0113.

Paths are relative to `extensions/kvcoder/`.

## Happy path

- **QA74-H1 a helper finishes its run.** *Then* both worker methods say a run ends only when its done condition is
  met, its steps run out, or it is blocked, never to report progress or after one part, and that a large task is done
  in parts in the same run. `test/unit/prompt-helpers.test.ts`
- **QA74-H2 the lead stays quiet on an ending that needs nothing.** *Then* the lead's Delegate part says that when a
  helper's answer needs nothing from the lead and changes nothing for the person, it replies with nothing, and that a
  helper stopped with work left is continued with all that is left. `test/unit/prompt-helpers.test.ts`
- **QA74-H3 an empty reply to a background ending ends the turn quietly.** *Given* a chat whose helper ends while the
  chat is idle, *when* the lead's reply to its ending has no text and no call, *then* the turn ends `done` after one
  step, with no hint and no second request. `test/quiet-ending.test.ts`
- **QA74-H4 a final answer covers the request.** *Then* the lead's Finish and the general method say the final answer
  answers each thing the person asked for in this request, a short line each, what is still open included, and that
  while helpers still work on it the reply is one line or nothing. `test/unit/prompt-helpers.test.ts`
- **QA74-H5 copy, don't retype.** *Then* the lead's and both workers' methods hold "Copy text, data, or code you
  didn't write … never by typing it again". `test/unit/prompt-helpers.test.ts`
- **QA74-H6 a report says how much was checked.** *Then* the worker's Return part says Evidence gives how much a
  check, review, or comparison covered, and a claim without it goes under Unchecked. `test/unit/prompt-helpers.test.ts`
- **QA74-H7 the brief carries the person's instructions.** *Then* Delegate says the brief carries, in the person's
  words, what they asked for that applies to the run. `test/unit/prompt-helpers.test.ts`
- **QA74-H8 `maxSteps` limits a run.** *Given* `delegate run` with `maxSteps: 3`, *then* the helper's turn ends at 3
  steps, and the payload's shape names `maxSteps?`. `test/delegate-background-only.test.ts`,
  `test/delegate-brief.test.ts`
- **QA74-H9 large work is split.** *Then* the path rule says work too large for one pass is split and never a reason
  to stop, and "Decide for me"'s Clarify says no question goes to the person in a reply either.
  `test/unit/prompt-helpers.test.ts`
- **QA74-H10 the designer looks; code is readable.** *Then* the ui-ux worker's instructions say to open the running
  app with the `mcp` browser before designing, Delegate says a designer's brief gives the app's address, and the lead's
  and engineering worker's methods hold the readable-code rule. `test/unit/prompt-helpers.test.ts`
- **QA74-H11 the smaller rules.** *Then* the check rule reads console errors, the artifacts rule reuses an artifact's
  id, and lead and workers send scratch output to a temporary folder outside the workspace.
  `test/unit/prompt-helpers.test.ts`

## Edge cases

- **QA74-E1 a person's turn keeps the hint.** *Given* a turn the person started, *when* a reply is empty, *then* it
  still gets ADR 0054's hint and a second step (M2.4-E162 unchanged). `test/incomplete-reply.test.ts`
- **QA74-E2 a person's message in a background turn keeps the hint.** *Given* a turn opened by a helper's ending into
  which the person's message was queued, *when* a reply is empty, *then* it gets the hint and a second step.
  `test/quiet-ending.test.ts`
- **QA74-E3 a helper's empty reply is never quiet.** *Given* a helper whose reply is empty, *then* it gets the hint and
  a second step. `test/quiet-ending.test.ts`
- **QA74-E4 `budget` is refused.** *Given* `delegate run` with `budget: 30`, *then* it fails `VALIDATION_FAILED`, and
  `maxSteps` of 0 or 61 fails too. `test/delegate-brief.test.ts`
- **QA74-E5 an empty context list is no context.** *Given* `delegate run` with `context: []`, *then* the run starts
  and its task has no Context section. `test/delegate-brief.test.ts`
- **QA74-E6 a worker gets no lead rules.** *Then* a worker's method has no "replies with nothing" and no final-answer
  rule. `test/unit/prompt-helpers.test.ts`
