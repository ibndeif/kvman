# QA 77 — Edit and undo a message: the chat and its file changes rewound (ADR 0118)

**Asked.** The owner said "in kvcoder, we need to add the undo feature and edit message so the user should be able to
edit a previous messages or undo the latest message and this should clean all edits that has been done", and chose,
over eleven questions, the recommended option each time. The answers are ADR 0118.

Paths are relative to `extensions/kvcoder/`. "The chat" is a top-level session; "M" is the message rewound to, at
`seq` S.

## Happy path

- **QA77-H1 an edit rewinds and sends.** *Given* a chat where M asked for a change and the agent edited `a.txt` (one →
  two) and answered, and a second message followed, *when* the person edits M to "again" with `files: true`, *then*
  `a.txt` holds "one" again, the result is `{ restored: ['a.txt'], deleted: [], left: [] }`, the messages from S on are
  gone, the chat's last person's message is "again", and a new turn ran on it. `test/rewind-edit.test.ts`
- **QA77-H2 a file kvman created after M is deleted.** *Given* the agent wrote `new.txt` after M, *when* the person
  edits M, *then* `new.txt` is gone and `deleted` is `['new.txt']`. `test/rewind-edit.test.ts`
- **QA77-H3 an undo returns the message for the send box.** *Given* the latest message the person typed had text, an
  image, and an attached file, and the agent then changed `a.txt`, *when* the person undoes with `files: true`, *then*
  the result's `text` is the typed text without the `Attached files:` lines, `fileIds` and `fileNames` are its image's,
  `attachments` is `['attachments/notes.txt']`, `a.txt` is back, and the chat holds no message from S on.
  `test/rewind-undo.test.ts`
- **QA77-H4 conversation only.** *Given* changes after M, *when* the person undoes with `files: false`, *then* the files
  and their copies stay, and *when* the person then edits an earlier message with `files: true`, *then* those files go
  back too. `test/rewind-undo.test.ts`
- **QA77-H5 the preview.** *Given* after M a file restored, one created, one changed since by the person, and one whose
  content before was over 1 MB, *when* `kvcoder.rewind.files.list { sessionId, seq: S }` runs, *then* it returns them by
  path with `restore`, `delete`, `changedSince`, and `tooLarge`, `messages` counts the stored and queued messages from
  S on, `running` is false, and no file or record changed. `test/rewind-preview.test.ts`
- **QA77-H6 several changes as one.** *Given* `a.txt` changed before M (one → two) and twice after it (two → three →
  four), *when* the chat is rewound to M, *then* `a.txt` holds "two", and the change before M keeps its copy.
  `test/rewind-files.test.ts`
- **QA77-H7 copies for the chat's life.** *Given* 25 changes of different files after M, *when* the chat is rewound to
  M, *then* all 25 go back: no copy was dropped at 20. `test/rewind-files.test.ts`
- **QA77-H8 an undo after M is rewound too.** *Given* a change before M (one → two) and the agent's `fs undo` of it
  after M (back to one), *when* the chat is rewound to M, *then* the file holds "two", and a later `fs undo` takes it back
  to "one" again. `test/rewind-files.test.ts`
- **QA77-H9 a helper started after M.** *Given* the lead started a helper after M that wrote `helper.ts`, *when* the
  chat is rewound to M, *then* `helper.ts` is gone, the helper's session and its records are deleted, and
  `kvcoder.job.list` no longer lists it. `test/rewind-helpers.test.ts`
- **QA77-H10 a helper started before M keeps running.** *Given* a background helper started before M changed `b.txt`
  after M and is still running, *when* the chat is rewound to M, *then* `b.txt` goes back, the helper is still running,
  and its result still arrives in the chat when it ends. `test/rewind-helpers.test.ts`
- **QA77-H11 artifacts and the map.** *Given* an artifact `plan` created before M and changed after it, an artifact
  `report` created after it, and a map first set after it, *when* the chat is rewound to M, *then* `report` and the map
  are deleted and `plan` keeps its latest version; *given* instead a map set before M, *then* it stays.
  `test/rewind-records.test.ts`
- **QA77-H12 the records.** *Given* two turns after M, a summary stored after M, and `clearedThroughSeq` and
  `collapsedThroughSeq` past S, *when* the chat is rewound to M, *then* those turns and the summary are deleted, both
  marks are below S, `nextSeq` is unchanged, the session's `usage` and `durationMs` are unchanged, and the next message's
  `seq` is the old `nextSeq`; the marks' rule is checked on its own, since a test can't set them through the store.
  `test/rewind-records.test.ts`, `test/unit/rewind-marks.test.ts`
- **QA77-H13 a running turn is stopped.** *Given* a turn waiting on an approval after M, *when* the person edits M,
  *then* the question is gone, no `CANCELLED` notice is left, and the edited message's turn runs.
  `test/rewind-edit.test.ts`
- **QA77-H14 a process started after M keeps running quietly.** *Given* a background process started after M, *when*
  the chat is rewound to M, *then* it still runs with `quiet: true`, and when it exits no message is added to the chat.
  `test/rewind-helpers.test.ts`
- **QA77-H15 a program worker's run started after M stops.** *Given* a program worker's run started after M, *when* the
  chat is rewound to M, *then* its job is cancelled, its record is deleted, and no message tells of it.
  `test/rewind-helpers.test.ts`
- **QA77-H16 the views go.** *Given* the agent read `a.txt` before M, *when* the chat is rewound to M and the next turn
  edits `a.txt` without reading it, *then* the edit fails saying to read it first. `test/rewind-files.test.ts`
- **QA77-H17 a slash command's message is undone.** *Given* the latest message that started work was sent by an
  extension's slash command, *when* the person undoes, *then* it is removed and returned, and a kvcoder hint after it is
  removed with it. `test/rewind-undo.test.ts`
- **QA77-H18 attachments on a send.** *Given* `attachments/notes.txt` in the workspace, *when* the person sends with
  `attachments: ['attachments/notes.txt']`, *then* the message's text ends with `Attached files:` naming it once, after
  any newly saved file, and no second copy is made. `test/rewind-attachments.test.ts`
- **QA77-H19 an edit keeps some attachments.** *Given* M had two images and two attached files, *when* the person edits
  it keeping one of each, *then* the new message holds that image and names that file. `test/rewind-attachments.test.ts`
- **QA77-H20 the actions in the conversation.** *Given* a chat with two typed messages and a slash command's message
  last, *then* the typed ones show Edit, only the slash command's shows Undo, and a queued message shows neither; in a
  helper's chat none shows. `test/web/message-rewind.test.ts`
- **QA77-H21 the edit box.** *When* the person presses Edit, *then* the message becomes a box with its typed text, its
  chips, "Also undo file changes (3 files)" checked, the left files with why, "Shell commands' changes aren't undone.",
  "Messages after this one will be removed.", and "This stops the agent." while it runs; Save & send runs
  `kvcoder.message.edit` with the box's text, the kept chips, and the checkbox, and the conversation reloads whole.
  `test/web/message-rewind.test.ts`
- **QA77-H22 the undo confirmation.** *When* the person presses Undo and confirms, *then* `kvcoder.message.undo` runs and
  the send box holds the undone text before what it held, a blank line between, with its chips added.
  `test/web/message-rewind.test.ts`

## Edge cases

- **QA77-E1 a helper's chat.** *Then* `rewind.files.list`, `message.edit`, and `message.undo` on a helper's session fail
  `VALIDATION_FAILED`. `test/rewind-validation.test.ts`
- **QA77-E2 the person only.** *Then* all three fail `NOT_PUBLIC` for an extension's caller.
  `test/rewind-validation.test.ts`
- **QA77-E3 not a message to edit.** *Then* `message.edit` with a `seq` the chat doesn't hold, an assistant reply's, a
  background result's, a slash command's, or a kvcoder hint's fails `VALIDATION_FAILED` and rewinds nothing.
  `test/rewind-validation.test.ts`
- **QA77-E4 nothing to undo.** *Given* a chat with no message the person typed or a slash command sent, *then*
  `message.undo` fails `VALIDATION_FAILED`. `test/rewind-validation.test.ts`
- **QA77-E5 an edit adds nothing.** *Then* an edit whose `fileIds` include one the message didn't have, or whose
  `attachments` name a file its text didn't, fails `VALIDATION_FAILED` and rewinds nothing.
  `test/rewind-validation.test.ts`
- **QA77-E6 a bad attachment path.** *Then* a send whose `attachments` holds a path outside `attachments/`, one that
  leaves the folder through `..`, a missing file, or a folder fails `VALIDATION_FAILED` and adds no message.
  `test/rewind-attachments.test.ts`
- **QA77-E7 changed since.** *Given* the person changed `a.txt` after the agent did, *when* the chat is rewound with
  files, *then* `a.txt` keeps the person's content, `left` holds `{ path: 'a.txt', reason: 'changedSince' }`, the other
  files go back, and `a.txt`'s copies after M are deleted. `test/rewind-files.test.ts`
- **QA77-E8 too large.** *Given* a change of a file whose content before was over 1 MB, *then* its copy has
  `tooLarge: true` and no content, a rewind leaves it with `reason: 'tooLarge'`, and `fs undo` of it fails
  `VALIDATION_FAILED` saying no copy was kept. `test/rewind-files.test.ts`
- **QA77-E9 a repeated edit.** *Given* an edit with a `sendId` was accepted, *when* it is sent again with the same
  `sendId`, *then* it returns empty lists and rewinds nothing. `test/rewind-edit.test.ts`
- **QA77-E10 records from before ADR 0118.** *Given* a record with no `atSeq`, *then* it counts as after M exactly when
  its `createdAt` (`startedAt`, `updatedAt`) is later than M's, and one with `atSeq` by that alone.
  `test/unit/rewind-marks.test.ts`
- **QA77-E11 equal times.** *Given* a fake clock that doesn't move, so two changes of one file after M have the same
  `createdAt`, *then* the rewind still restores the content before the first, by `order`, and older records sort
  first by time. `test/rewind-files.test.ts`, `test/unit/rewind-marks.test.ts`
- **QA77-E12 the first message.** *Given* M is the chat's first message, *when* it is undone, *then* the chat has no
  message, both marks are `null`, and its title stays. `test/rewind-undo.test.ts`
- **QA77-E13 a stopped step changes nothing.** *Given* a change from a step that is no longer its session's current
  step (its step intent names the call's root job), *then* it fails "This step was stopped, so nothing was written.";
  the same for a session that is gone or being deleted; a change from the current step, or from no step (the person's
  undo), goes on. Run in a real store transaction, since a stopped step's late call can't be timed in a whole kernel.
  `test/unit/change-fence.test.ts`
- **QA77-E14 the person's own undo after M.** *Given* the person's Changes-view Undo of a change after M, *when* the chat
  is rewound to M, *then* the file holds what it held at M. `test/rewind-files.test.ts`
- **QA77-E15 a queued message.** *Given* a message queued while a turn runs after M, *when* the chat is rewound to M,
  *then* the queued message is deleted too and counted in the preview's `messages`. `test/rewind-records.test.ts`
- **QA77-E16 the changes list follows.** *Given* `a.txt` changed before and after M and `b.txt` only after, *when* the
  chat is rewound to M with files, *then* `kvcoder.change.list` lists `a.txt` and not `b.txt`.
  `test/rewind-files.test.ts`
- **QA77-E17 pieces saved after M.** *Given* `fs part` pieces saved after M, *when* the chat is rewound to M, *then* they
  are deleted, and pieces saved before it stay. `test/rewind-records.test.ts`
- **QA77-E18 an old receipt still matches.** *Then* a send's fingerprint without `attachments` is the same as before
  ADR 0118, and one with them differs. `test/unit/send-fingerprint.test.ts`
- **QA77-E19 the box's failures.** *Then* Save & send is disabled while the text is empty, Esc and Cancel close the box
  without a call, and a failed edit keeps the box with a line saying what failed. `test/web/message-rewind.test.ts`
- **QA77-E20 no files to undo.** *Given* no `fs` change after M, *then* the box has no checkbox and still shows that
  messages after it will be removed. `test/web/message-rewind.test.ts`
