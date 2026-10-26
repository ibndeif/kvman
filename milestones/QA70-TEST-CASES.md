# QA 70 — deleting artifacts: the agent, the person, and age (ADR 0105)

**Asked.** After ADR 0104, the owner asked that stale artifacts in a running chat be removed too, to save context,
and chose the agent's `artifact delete`, the panel's Delete with a confirmation and a message to the agent, and an
age limit that is off by default. Their answers are ADR 0105.

Paths are relative to `extensions/kvcoder/`.

## Happy path

- **QA70-H1 the agent deletes one.** *Given* a chat with `old-report`, *when* the agent calls `artifact delete
  { id: "old-report" }`, *then* the result is `{"id":"old-report","deleted":true}`, `kvcoder.artifact.list` no longer
  has it, and no message is added. `test/artifact-delete.test.ts`
- **QA70-H2 the entry says when.** *Then* the `artifact` entry says to delete an artifact that is superseded or no
  longer true and never to empty one, and the lead's commands include `delete {"id": …}`. `test/artifact-delete.test.ts`
- **QA70-H3 the person deletes one.** *When* the person runs `kvcoder.artifact.delete` on an idle chat, *then* it is
  deleted and the chat has one message ``The person deleted the artifact `old-report`.`` with source
  `{ kind: 'extension', name: '@kvman/kvcoder' }`, and no turn starts. `test/artifact-delete.test.ts`
- **QA70-H4 the panel's Delete.** *Given* the panel shows an artifact, *when* the person presses Delete, *then*
  "Delete this artifact?" shows with Cancel and Delete, and Delete runs `kvcoder.artifact.delete` with
  `{ sessionId, payload: { id } }`. `test/web/artifact-delete.test.ts`
- **QA70-H5 expiry by age.** *Given* `kvcoder.artifacts.keepDays` 30 and an idle chat with `old` updated 31 days ago
  and `fresh` updated today, *when* `kvcoder.session.prune` runs, *then* `old` is deleted, `fresh` stays, and the
  chat has one message ``Artifacts not updated in 30 days were deleted: `old`.`` `test/artifact-expiry.test.ts`
- **QA70-H6 the setting.** *Then* `kvcoder.artifacts.keepDays` defaults to 0, is on the Chats card after
  `kvcoder.sessions.keep`, and has `en` and `ar` titles and descriptions. `test/artifact-expiry.test.ts`,
  `test/ui.test.ts`

## Edge cases

- **QA70-E1 an unknown id** fails `NOT_FOUND` with `params.id`; unknown keys or a bad id fail `VALIDATION_FAILED`.
  `test/artifact-delete.test.ts`
- **QA70-E2 a helper is refused** `artifact delete` with `VALIDATION_FAILED`, and its prompt has no `delete`.
  `test/artifact-delete.test.ts`
- **QA70-E3 the person's delete while a turn runs** is queued; the running turn's next step reads it, and no
  new turn starts.
  `test/artifact-delete.test.ts`
- **QA70-E4 an extension's delete** adds no message. `test/artifact-delete.test.ts`
- **QA70-E5 Cancel** closes the question and deletes nothing; the map and the changes views have no Delete.
  `test/web/artifact-delete.test.ts`
- **QA70-E6 keepDays 0** deletes nothing, however old. `test/artifact-expiry.test.ts`
- **QA70-E7 a chat that isn't idle** keeps its old artifacts. `test/artifact-expiry.test.ts`
- **QA70-E8 the two parts apart**: with `kvcoder.sessions.keep` 0 and `keepDays` 30, expiry runs; with `keep` 1 and
  `keepDays` 0, sessions are pruned and artifacts aren't. `test/artifact-expiry.test.ts`
- **QA70-E9 several**: two old artifacts are named in id order in one message. `test/artifact-expiry.test.ts`
