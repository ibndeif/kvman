# QA 80 — Artifacts after a trim: `artifact list`, and a collapsed turn names the artifacts it changed (ADR 0123)

**Asked.** The owner reported that after "Continue." the agent lost access to the chat's artifacts. The trim had
collapsed the turns that wrote them, their final answers named them by title only, and the `artifact` connector had no
`list`, so the agent guessed ids and got `NOT_FOUND`. The owner chose both fixes.

Paths are relative to the repository root.

## Happy path

- **QA80-H1 `artifact list` names the chat's artifacts.** *Given* a chat with artifacts `b` then `a` written, then `b`
  edited, *when* the agent calls `artifact list {}`, *then* the result is `[{ id: 'b', … }, { id: 'a', … }]`, each with
  `id`, `title`, `format`, `version`, and `updatedAt` and nothing else, newest change first (ADR 0123, 1). —
  `extensions/kvcoder/test/artifact-list.test.ts`
- **QA80-H2 a collapsed turn names its artifacts.** *Given* a collapsed turn whose `artifact write` of `report`
  ("Report") and `artifact edit` of `design` ("Design") succeeded, *when* the history is sent, *then* its final answer
  ends with `[kvman: artifacts changed in this turn: design (Design), report (Report)]`, after the files line when the
  turn changed files (ADR 0123, 2). — `extensions/kvcoder/test/collapse-artifacts.test.ts`

## Edge cases

- **QA80-E1 a subagent lists its chat's artifacts.** *Given* a helper session of a chat with an artifact, *when* the
  helper calls `artifact list {}`, *then* it gets the chat's artifact: a helper reads artifacts with `list` and `get`, never writes them (ADR 0123, 3). — `extensions/kvcoder/test/artifact-list.test.ts`
- **QA80-E2 an empty chat lists nothing.** *Given* a chat with no artifact, *when* `artifact list {}` is called,
  *then* the result is `[]`. — `extensions/kvcoder/test/artifact-list.test.ts`
- **QA80-E3 `list` takes no payload fields.** *Given* the agent calls `artifact list { "id": "x" }`, *then* it fails
  `VALIDATION_FAILED`, as every strict payload does. — `extensions/kvcoder/test/artifact-list.test.ts`
- **QA80-E4 `help` shows `list`.** *Given* the `artifact` connector, *when* the agent calls `artifact help`, *then*
  the commands include `list`. — `extensions/kvcoder/test/artifact-list.test.ts`
- **QA80-E5 a failed artifact call isn't named.** *Given* a collapsed turn whose only artifact call is an `artifact
  edit` that failed (`isError` true), *then* its final answer has no artifacts line. —
  `extensions/kvcoder/test/collapse-artifacts.test.ts`
- **QA80-E6 one entry per id, with its last title.** *Given* a collapsed turn that wrote `report` as "Draft" and then
  as "Report", *then* the line names `report (Report)` once. — `extensions/kvcoder/test/collapse-artifacts.test.ts`
- **QA80-E7 the line doesn't change later.** *Given* a collapsed turn that wrote `report`, *when* `report` is later
  retitled or deleted, *then* the collapsed turn is still sent with `report (<its title in that turn>)`, byte for
  byte as before. — `extensions/kvcoder/test/collapse-artifacts.test.ts`
- **QA80-E8 only collapsed turns get the line.** *Given* a turn after `collapsedThroughSeq` that wrote an artifact,
  *then* it is sent whole, with its calls and results, and no artifacts line. —
  `extensions/kvcoder/test/collapse-artifacts.test.ts`
- **QA80-E9 other calls don't count.** *Given* a collapsed turn with only `artifact get` and `artifact delete` calls,
  *then* it has no artifacts line. — `extensions/kvcoder/test/collapse-artifacts.test.ts`
