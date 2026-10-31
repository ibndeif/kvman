# ADR 0113 — Helpers that finish, answers that cover the request

Status: accepted by the product owner on 2026-10-31. It amends plan 08 §8.2 and §8.5, ADR 0054 (1), ADR 0076,
ADR 0108 (2), and ADR 0112 (4).

## Context

The owner built a bilingual textbook reader with kvcoder (chat "Bilingual Textbook Reader and Quizzes", 2026-10-31,
lead on gpt-6.1-terra at xhigh with "Decide for me", 23 helpers on gpt-6-luna at high). A read-only review of it found:

- ADR 0112's talking rule held: 8 of 154 lead replies with calls had no sentence (70% before).
- Helpers stopped after a part. The chapter 4 helper ran 16 times, mostly one page each; the chapter 1 helper 10
  times. Each ending woke the lead, which sent "continue from page N" and then a filler final answer ("Chapter 4
  remains in progress."): 46 of 52 lead turns, about $1.13, more than all the helpers' work ($0.90).
- Final answers reported the last event, not the request. The request "hide the sidebar, and review the translation
  and the formatting" ended with an answer about the sidebar only; four urgent fixes ended with "the independent check
  passed for page navigation…".
- Helpers typed the English source again by hand, and it drifted from the PDF ("this sense that planning is…" became
  "This is the sense in which planning is…"); pages were shortened and redone twice.
- Four of seven review helpers reported "matched" or "no changes needed", then said they had checked only excerpts.
- What the person said in the chat never reached the helpers: a reviewer put back the name the person had asked to
  remove.
- `delegate run` failed 16 times in three rounds: `budget` sent as "large" or "high", and `context: []`.
- With "Decide for me", the lead stopped three times before any work (two questions in its reply, then "I can't do
  this in this session") until the person said "use subagents".
- The person called the UI ugly twice. The ui-ux helpers ran one to three steps and never opened the running app; the
  page was written as packed lines up to 6,779 characters.
- Every browser check said "Console: 1 errors" and nobody read it; the app was published as three url artifacts; tool
  output (`-.png`, `-.xml`, `--177.png`) was left in the project.

## Decisions

1. **A helper finishes its run; the lead stays quiet when a helper's ending needs nothing.** The worker method says:
   a run ends only when its done condition is met, its steps run out, or it is blocked; never to report progress or
   after one part; a large task is no blocker, but is done in parts, one after another, in the same run. The lead's
   Delegate part says: when a helper's answer needs nothing from the lead and changes nothing for the person, the lead
   replies with nothing; a helper that stopped with work left is continued with all that is left, not one piece. In
   code, a top-level chat's reply with no text and no call ends the turn as `done`, with no hint, when no message of
   the turn came from the person (the turn was opened by background results); the person sees only the quiet
   background line (ADR 0112, 5). Everywhere else an empty reply keeps ADR 0054's hint and second step; a helper's
   empty reply is never quiet, since its last reply is its answer.
2. **A final answer covers the request.** The answer rule (ADR 0112, 4) becomes: "Your final answer starts with the
   result, in plain words and as short as the facts allow, and answers each thing the person asked for in this
   request, a short line each, what is still open included. While helpers still work on the request, end with one
   line or nothing; when the last of them ends, give that whole answer. Say what you couldn't check, what still runs,
   or what you noted for later only when it matters for what the person does next." Lead and general method alike.
3. **Copy, don't retype.** Lead and worker methods, both kinds: "Copy text, data, or code you didn't write (a
   document's text, a file, output) with a program, never by typing it again: retyping changes it." The owner's model for helpers came from their saved
   `kvcoder.delegate.workers` (gpt-6-luna on `general`, `ui-ux`, `tester`, and `reviewer`; `kvcoder.delegate.model`
   was already `null`). On the owner's choice, those four entries' `model` was set to `null` in their home on
   2026-10-31, so they use the chat's model, and `ui-ux`'s saved instructions were replaced with the shipped text of
   decision 8; nothing else in the list changed. Shipped defaults are unchanged.
4. **A report says how much was checked.** The worker's Return part adds: for a check, a review, or a comparison,
   Evidence says how much was covered (for example "pages 36–66, 31 of 31") and what wasn't; a claim without that
   goes under Unchecked.
5. **The brief carries the person's instructions.** Delegate says: a worker sees only its brief and the project's rule
   files, so the brief carries, in the person's words, what they asked for that applies to the run (what to keep,
   remove, or never do).
6. **`maxSteps`, not `budget`.** `delegate run`'s `budget` is renamed `maxSteps`: "The most steps the run takes, a
   number from 1 to 60; 60 when left out." An empty `context` list is accepted and means no context. The session's
   stored run keeps its `budget` field; only the payload is renamed.
7. **Large work is split, and "Decide for me" decides.** The path rule adds: work too large for one pass is never a
   reason to stop or to say it can't be done; split it into parts for workers that run at once, or do them one after
   another. Clarify for "Decide for me" adds: "Put no question to the person in a reply either: decide, say what you
   chose, and go on."
8. **The designer looks; code is laid out for people.** The ui-ux worker's instructions add: when the app runs, open it
   with the `mcp` connector's browser and look at it before designing, and design from what is there. Delegate adds
   that a designer's brief gives the running app's address. Lead and engineering worker methods add: "Write code laid
   out for the people who will read it: one statement per line, indented, and no packed or minified lines in source
   you write."
9. **Smaller rules.** The check rule adds: an error the page or program reports during a check (a browser console
   error too) is read and fixed, or said why it doesn't matter. The artifacts rule adds: "Show a thing again under its
   artifact id, never as a second artifact." Lead and workers: "Put scratch output (images, extracted text, logs) in a
   temporary folder outside the workspace folder, and remove it when done." Remembering a denied call was not chosen.

## Consequences

The lead's method grows by a few sentences but stays shorter than before ADR 0112 (13,698 characters against
13,723; QA73-H5 now checks that bound). The quiet ending relies on the model sending an empty reply; a model that
sends one line instead shows one line, as before. Delegate payloads with `budget` now fail with the payload's shape,
which names `maxSteps`. Scenarios: `milestones/QA74-TEST-CASES.md`.
