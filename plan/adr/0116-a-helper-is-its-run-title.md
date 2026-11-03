# ADR 0116 — A helper is told who it is: its run's title

Status: accepted by the product owner on 2026-11-03 ("make sure that kvcoder always gives the subagents an identity on
delegate so the subagent be focused"). It amends plan 08 §8.2 and §8.5, ADR 0037 (1), ADR 0082 (11), ADR 0108 (2),
and ADR 0113 (its bound on the lead's method).

## Context

The lead writes a `title` on every `delegate run`, "the role this run plays … such as UI expert or Node.js expert", but
only the person saw it, as the helper's name. The helper itself was told only "You are kvman Coder, working on one task
that the lead agent gave you, … a software engineer with long, deep experience", the same line for every run, so a
helper looking for a race in Node.js streams and one checking a page's contrast started as the same generalist.

## Decisions

1. **The title is the helper's identity.** No new field: the title the lead already writes (1 to 200 characters) is
   also who the helper is. Its description says: "Who the helper is: the expert this run needs, in a few words, such
   as UI expert or Node.js streams expert, never the task itself. The helper is told it is this expert, and the person
   sees it as the helper's name. Keep it under 60 characters; a longer one is shortened." The lead's Delegate rule
   adds: "Name in title the expert the run needs, such as Node.js streams expert, not the task: the worker is told it is
   that expert, which keeps it focused."
2. **It is the first line of the helper's system prompt.** It replaces the generic helper line: `You are the <title>,
   doing one task that the lead agent gave you, <place>.` With a product's `identity` (ADR 0082, 11), the line is
   `<identity> Here you are the <title>, doing one task that the lead agent gave you, <place>.` The whole title is
   used, not the name the person sees, which is cut at 60 characters (ADR 0051, 4). A helper's session keeps it in its
   run, as `role`; a helper from before this ADR has none and keeps the old line. Helpers no longer share the cached
   start of one system prompt, so each helper's first step writes its own cache; its later steps still read it.
3. **A specialist's identity stays, narrowed by the run's.** The run's line comes first and the worker's block stays
   as it is (`## Worker: ui-ux` / "You are a senior UI/UX designer…"), so the lead's title narrows the specialist's
   craft to this run.
4. **Program workers are unchanged.** A program worker is another program with its own prompt; it gets its task as
   before (plan 08 §8.5).
5. **The lead's method may be up to 13,900 characters.** The Delegate sentence of 1 adds about 150 characters to a
   method of about 13,707, past ADR 0113's bound of 13,723; the owner chose to raise the bound to 13,900 over leaving
   the rule to `title`'s description or trimming other rules. QA73-H5 checks the new bound.

Scenarios: `milestones/QA76-TEST-CASES.md`, written before source.
