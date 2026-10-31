# QA 75 — a new request gets a new map; one artifact per address (ADR 0114)

**Asked.** After a second review of the bilingual reader chat, the owner said "Fix the new issues as well". The answer
is ADR 0114.

Paths are relative to `extensions/kvcoder/`.

## Happy path

- **QA75-H1 a new goal starts a new map.** *Given* a map whose steps `chapter-1` and `chapter-2` are done and doing,
  with a note, *when* the map is set with another goal and the same ids, *then* both steps are `todo` with no evidence,
  and the map has no notes. `test/new-request-map.test.ts`
- **QA75-H2 one url artifact per address.** *Given* url artifact `management-app` at `http://127.0.0.1:8000/` and a
  Markdown artifact that mentions that address, *when* `reader` is written at `http://127.0.0.1:8000`, *then* its
  result has `removed: ["management-app"]`, and the chat's artifacts are `notes` and `reader`.
  `test/new-request-map.test.ts`
- **QA75-H3 what needs a worker's answer waits for it.** *Then* Delegate says to start what needs a worker's answer
  once it arrives. `test/unit/prompt-sequencing.test.ts`
- **QA75-H4 a quick look answers.** *Then* the lead's and the workers' methods, both kinds, end the evidence rule with
  "what one quick look would answer, look up instead of leaving it open." `test/unit/prompt-sequencing.test.ts`
- **QA75-H5 the map entry says it.** *Then* the `execution-map` entry says a new goal starts a new map.
  `test/unit/prompt-sequencing.test.ts`

## Edge cases

- **QA75-E1 the same goal keeps progress.** *Given* the same map, *when* it is set again with the same goal, *then*
  the steps keep `done` and `doing`, and the note stays. `test/new-request-map.test.ts`
- **QA75-E2 another address or the same id removes nothing.** *Given* url artifacts at two addresses, *when* one is
  written again under its own id, *then* the result has no `removed` and both stay. `test/new-request-map.test.ts`
- **QA75-E3 the lead's method stays short.** *Then* the lead's method is under 13,723 characters (QA73-H5).
  `test/unit/prompt-lead.test.ts`
