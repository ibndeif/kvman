# ADR 0114 — A new request gets a new map; one artifact per address

Status: accepted by the product owner on 2026-10-31 ("Fix the new issues as well"). It amends plan 08 §8.2 and §8.5,
ADR 0064, ADR 0108 (1), ADR 0112 (4), and ADR 0113 (1 and 9).

## Context

The owner gave the bilingual reader chat another task (navigate to any page, then an academic Arabic that keeps the
English names), still on the code from before ADR 0113. A read-only review found, besides what ADR 0113 already fixes:

- The new task's map opened at "7 of 9 done": it reused the step ids `chapter-1` to `chapter-7` of the previous
  request's map, and `set` keeps the status of every step whose id stays. Two extra calls reset them.
- The lead started two terminology reviews (19:18), then the seven chapter revisions (19:26) before either review came
  back (19:32 and 20:11); it then sent word lists to seven running helpers and reopened a finished chapter.
- Three url artifacts showed the same address (`management-app`, `management-reader`, `reader`); the newest write went
  to an older id.
- Tool output stayed in the project: `-.png`, `-.xml`, `--177.png`, `--179.png`, and 35 images extracted from the PDF
  into the person's `books/` folder.
- The lead said "The PDF has 215 pages; the reader covers 8–209. I haven't checked what is on the remaining pages",
  which one extraction would have answered.

## Decisions

1. **A new goal starts a new map.** `execution-map set` keeps each step's status, evidence, note, and details only when
   its goal equals the current map's goal; with another goal every step starts `todo` with the details given, and the
   map's notes are cleared. The entry says: "Setting the map again with the same goal keeps the status of each step
   whose id stays … A new request is a new goal, and a new goal starts a new map: every step starts todo, with only
   the details you give." The map's version goes on counting.
2. **What needs a worker's answer starts once it arrives.** Delegate's background sentence becomes: "after starting
   workers, go on with what doesn't need them or end your turn, and start what needs a worker's answer once it
   arrives; …". The context rule's "Never wait for a helper: its answer wakes you." is dropped, since Delegate says
   it.
3. **One url artifact per address.** `artifact write` of a url artifact deletes the chat's other url artifacts whose
   address is the same (compared as URLs, so a trailing slash doesn't matter), and its result names them in
   `removed`. The entry adds: "A chat shows an address in one url artifact: writing it under another id removes the
   old one." Other formats are untouched.
4. **Leftover files.** ADR 0113, 9's scratch rule covers new ones. The owner's existing leftovers are listed for them
   to delete; kvman's tools did not delete files in the person's folder.
5. **A quick look answers.** The evidence rule, for the lead and workers of both methods, becomes: "Decide from
   evidence: every decision and every claim rests on something you read, ran, or were told; what one quick look would
   answer, look up instead of leaving it open."
6. **Room in the lead's method.** To stay under the length before ADR 0112 (QA73-H5), two ADR 0113 sentences are
   shorter: the check rule's addition is "Fix, or explain, every error a page or program reports while you check it,
   console errors too.", and Delegate's is "Continue a worker that stopped early with all that is left. When a
   worker's answer needs nothing from you and changes nothing for the person, reply with nothing." The quiet ending
   itself (ADR 0113, 1) is unchanged. The method is 13,708 characters.

Scenarios: `milestones/QA75-TEST-CASES.md`.
