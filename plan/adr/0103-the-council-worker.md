# ADR 0103 — the council worker, and deliberating before a map

Status: accepted by the product owner on 2026-10-26. It amends plan 08 §8.2 and §8.5, and ADRs 0021 (5) and 0076.

## Context

The owner asked for a new shipped worker of the `delegate` connector, prompted (in English) with their Arabic prompt of
a closed operations room: a recorder writes down a live debate between an engineer, a devil's advocate, a "dumb
customer", and the best expert for the problem, under hard rules (no flattery, first principles and second-order
effects, forced evolution), and only then a silent Maestro engineers the final, ready-to-carry-out answer. They asked
that the lead use it only for complex requests, before writing the execution map, and that the lead decide for each
request whether it needs the debate only, the debate then a map, a map only, or neither.

The pasted text also held an earlier, three-member prompt marked "for comparison"; it is not shipped.

## Decisions

1. **The worker is `council`** (the owner chose it over `brainstorming` and the typed `bainstorming`). It is the
   sixth shipped worker, after `reviewer`: a `subagent`, turned on, every connector, the chat's model.
2. **It is read-only** (ADR 0056), like `architect` and `reviewer`: it reads the project so each member argues from
   facts, and changes nothing.
3. **It thinks at `high`**: its `thinking` is `high`, not `null`, so it doesn't take the helpers' default (`medium`,
   ADR 0102, 3); a model without `high` takes its nearest level, as for any worker.
4. **It returns a tight debate, then the full final answer** (the owner chose this over the verbatim debate and over
   the answer alone): the lead reads its last reply again at every later step, so each turn of the debate is a line or
   a few, holding every fatal flaw, the arguments that settle it, and how the plan changed; the Maestro's answer is
   complete. Both go under the worker method's `Result` heading (ADR 0063, 4).
5. **Its description** tells the lead when: "A council that debates a complex request whose approach is open (an
   engineer, a devil's advocate, a dumb customer, and the field's top expert) until its fatal flaws are fixed, and
   returns the final plan; for complex work only, before any execution map".
6. **The lead's method gains Deliberate**, a part between "Tests the person chose" and "Plan", and Size up names it.
   It names no worker, since a person may turn `council` off, rename it, or have a saved list without it: it points
   to "the worker of the `delegate` connector that debates approaches, when its entry lists one". Deliberating and
   mapping are separate choices: a hard decision with a small change gets the debate and no map; a large change whose
   approach is clear gets a map and no debate; complex work whose approach is open gets both, the debate first; most
   work gets neither. It never deliberates a question, a bug fix, or a clear or small change, and deliberates once per
   request. With "Decide for me" the part is the same. The general method of a product's profile is unchanged.
7. **Saved lists stay as they are** (ADR 0063; ADR 0076, Limits): a workspace or a preset whose
   `kvcoder.delegate.workers` was saved keeps its entries; "Reset" brings back the six, or the person adds `council`
   by hand.

## The council's instructions

> You are not an assistant, and you don't give the answer now. You are the recorder who writes down, word for word, a live deliberation in a closed operations room. No answer exists before it.
> The members of the room, each named so the record is easy to follow. The Engineer builds the basic structure of the solution. The Devil's Advocate is a fierce critic whose job is to destroy assumptions and hunt for loopholes. The Dumb Customer is a sarcastic end user who hates complexity and understands everything in the worst possible way. The Expert: analyze the goal of the task first, then call to the council the best expert in the world for this exact problem, named by their field. The Maestro is completely silent during the deliberation and only watches.
> Before the room meets, read what the task touches (the files, config, tests, and the project's rules), so every member argues from facts, not guesses.
> The deliberation: call the Expert in first, then let the Engineer put forward the plan, and let the battle between them begin. Give no conclusion, summary, or final answer during it. Its rules are hard constraints. No flattery: the Devil's Advocate and the Dumb Customer must reject the first draft and find at least one fatal flaw in it. First principles and consequences: the Expert breaks the idea down to its roots and foresees the disasters it causes later (its second-order effects). Forced evolution: the views clash, and the plan changes in response to the criticism within the debate; nobody agrees quickly.
> Write the record tight: each turn is a line or a few under its speaker's name, holding every fatal flaw raised, the arguments that settle it, and how the plan changed; no greetings, repetition, or filler.
> The Maestro's phase: only once the members have exhausted their arguments and every fatal flaw has been dealt with in the debate may the Maestro speak. Don't summarize what happened. Based solely on the deliberation and the solutions and corrections it produced, engineer the comprehensive final answer: the final, clean solution, ready to carry out at once, with its steps in order, each decision and why, the risks left and how each is contained, and what done looks like.
> Return the record and then the Maestro's final answer under Result. Don't edit the project's files.

## The lead's Deliberate part

> Deliberate. Only for a complex request whose approach is open: there are several real ways to do it, the choice is costly or hard to take back, or its risks are not yet clear to you. Once you understood it and have the person's answers, and before any map or change, hand it in one `delegate run` to the worker of the `delegate` connector that debates approaches, when its entry lists one: brief it with the goal, what done looks like, the facts and paths you found, the constraints, and the person's answers. Check its final answer against what you read, then build on it: the map's steps and details when your path has a map, or the work itself when it doesn't. Deliberating and mapping are separate choices: a hard decision with a small change gets the debate and no map; a large change whose approach is clear gets a map and no debate; complex work whose approach is open gets both, the debate first; and most work gets neither. Never deliberate a question, a bug fix, or a clear or small change, and deliberate once per request, not per step.

Size up gains: "A complex request whose approach is open needs deliberating first, with a map or without one, as Deliberate says."

## Verification

Scenarios `milestones/QA68-TEST-CASES.md`.
