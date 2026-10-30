# ADR 0112 — A conversation, not a procedure

Status: accepted by the product owner on 2026-10-30. It amends plan 08 §8.2 and §8.7, ADR 0089 (2), ADR 0097 (1),
ADR 0102 (1), ADR 0072 (3), ADR 0081 (5), ADR 0078, and ADR 0036 (14).

## Context

The owner said a kvcoder conversation "feels systematic and not seamless". A read-only look at the owner's chats from
2026-10-26 to 2026-10-30 (712 lead steps in 96 turns, all on OpenAI gpt-6.1-sol, gpt-6-luna, and gpt-6.1-terra) found:

- 501 of the 712 steps were calls with no words to the person; 132 had a sentence and calls; 79 were final answers.
  In one chat, after the person said "do it", about 19 steps (some 2.5 minutes) passed without one sentence. The
  narrate rule (ADR 0089, 2; ADR 0097, 1) was conditional ("when you learn something that changes what you do next",
  "don't announce routine calls"), and two rewordings had changed nothing.
- Into that silence the chat put the model's thinking-summary titles as rows of their own ("Checking DOMPurify
  install", "Inspecting") above folded call cards (ADR 0102, 1), which read like a build log.
- The lead's method was a long named pipeline (size up, understand, clarify, deliberate, plan, confirm, execute,
  finish). After "do it" the person got three separate `ask choice` forms in three replies (format, voice, plan).
- The Finish rule fixed the final answer's contents (done, checked and what it showed, unchecked, still running,
  noted), and the evidence rule added "say what you checked and what you didn't", so answers read as status reports.
- Background endings came as cards with the raw text the model reads (job ids, exit codes, stack traces), sometimes
  after the final answer; and "While kvman was stopped, these background calls ended…" opened the next exchange.
- A step took 12.7 s at the median and usually held one call.

## Decisions

1. **Every reply that makes a call starts with one short sentence to the person.** The narrate rule moves to the top
   of the lead's method, right after its first line, and is firm: every reply that makes a call starts with one short
   sentence, what it is doing and why, or what it found and what it does next; a reply that holds only calls is never
   sent; the sentence doesn't repeat what the call's card shows. The rest of the rule stays (plain words, the point
   first, no connector names, payloads, ids, or long output unless asked, a file or term named only when it helps, a
   short list for several items, no headings or tables in a short reply, and the example). The general method (ADR
   0082, 11) has the same rule. The `run` tool's description says it too, in words that fit a worker as well: "Start
   each reply that makes calls with one short sentence saying what you are doing and why." No field is added to `run`
   (the owner kept ADR 0102's choice).
2. **The agent's words lead the chat; a headline titles the calls under it.** The headline row (ADR 0102, 1) is
   gone. A run of call cards is still cut into groups where a reply's last headline changes, but a group's headline
   is now the small muted title at the start of its fold's row, before the fold's sentence (`<headline> · Read 2
   files, ran 1 search`, `dir="auto"`). A group with a headline folds from one call card, so the headline has a row; a
   group without one folds from two, as before. A reply's thinking shows as its "Thought" toggle inside the opened
   fold. A headline with no call card under it isn't shown (its replies' "Thought" toggles stay). An empty headline
   was never shown (`**` lines with no text aren't headlines) and still isn't. The running step's activity line and a
   helper's card keep the newest headline.
3. **A shorter method; the person's go-ahead is their agreement.** The lead's engineering method is rewritten
   shorter, in plain words, with fewer parts: Understand, Clarify, Deliberate, Map (was Plan and Confirm the plan),
   Execute, Stay on the task, Delegate, Show what the person will look at, and Finish. What it does stays: who
   decides, the lightest path for each task, a map only for work that changes several dependent parts or is hard to
   take back (never for a bug fix, a change to one or two files, or a fix the person described), questions asked
   after looking and before any work, all in one reply, `ask choice` with the recommended option first, deliberating
   only when asked, `risky`, approvals, Delegate's rules (ADR 0108), showing, and Finish's production-ready rules.
   New: the person's go-ahead ("do it", "yes", or the option that starts, chosen after the lead said what it would
   do) answers what it covers and is never asked again; and a map that does what the person already agreed to is
   confirmed by saying in a few lines what the lead understood and starting, without an `ask choice`. A map that
   changes what the person gets beyond what they agreed (the goal, what done looks like, what stays as it is, stored
   data, or what could go wrong) is still confirmed with `ask choice` as before. "Decide for me" (ADR 0097, 7) keeps
   deciding and never asks.
4. **A final answer gives the result first.** Finish's five-part answer is replaced by: "Your final answer starts
   with the result, in plain words and as short as the facts allow. Say what you couldn't check, what still runs, or
   what you noted for later only when it matters for what the person does next." The general method ends its answer
   the same way. The evidence rule keeps "every decision and every claim rests on something you read, ran, or were
   told" and drops "When you report a result, say what you checked and what you didn't." The check rule (ADR 0012, 10
   and 20; QA72-H3) stays: a claim that something works is checked, or said to be unchecked.
5. **A background ending is one quiet line.** A finished background job's or helper's result (ADR 0036, 14; ADR 0037,
   2) shows as one muted line, not a card: a status mark (a check for `succeeded`, a cross for `failed`, a plain
   circle for any other status or a run the list no longer holds; its accessible name is the job list's status word),
   the run's name (a helper's run title, else the call's words, else "Background job finished" or "A helper
   finished"), and how long it ran. Pressed, it shows the text the model read. The message that reports the runs that
   ended while kvman was stopped (ADR 0085, 5) is one such line, "2 runs ended while kvman was stopped", with a plain
   circle. The model still reads every one of these messages exactly as before.
6. **Pace is measured, not changed.** Nothing else changes for speed now. After this lands, the silent-step share,
   steps per turn, and median step time are measured again from real chats and reported to the owner.
7. **Models are compared after the fixes.** The same task runs once on gpt-6.1-sol and once on a Claude model in a
   copied kvman home (never the owner's own `~/.kvman`), and the same three numbers are reported. No default model
   changes until the owner decides.
