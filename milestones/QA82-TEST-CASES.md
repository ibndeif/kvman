# QA 82 — The "steps not done" line waits for the chat's helpers (ADR 0126)

**Asked.** The owner reported "4 steps of the execution map are not done." with Continue while the chat was still
working. In the chat of 2026-11-09 the lead started a background helper and ended its turn, so the chat was idle while
the helper worked. The owner chose to hide the line while helpers run, with background processes not counting.

Paths are relative to the repository root.

## Happy path

- **QA82-H1 the line waits for a running helper.** *Given* an idle chat whose map has steps left and a background job
  of `kind: 'subagent'` that is `running`, *then* the conversation has no "steps … not done" line; *when* the job
  ends and the chat is read again, *then* the line shows with Show the map and Continue
  (`extensions/kvcoder/test/web/execution-map-panel.test.ts`).

## Edge cases

- **QA82-E1 a program worker and a waiting helper hide it too.** *Given* the same chat with a `worker` job `running`,
  or a `subagent` job `waiting`, *then* there is no line (`extensions/kvcoder/test/web/execution-map-panel.test.ts`).
- **QA82-E2 a background process doesn't hide it.** *Given* the same chat with a `process` job `running` (a dev
  server), *then* the line shows (`extensions/kvcoder/test/web/execution-map-panel.test.ts`).
