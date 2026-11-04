# ADR 0118 — Edit and undo a message: the chat and its file changes rewound

Status: accepted by the product owner on 2026-11-04 ("in kvcoder, we need to add the undo feature and edit message so
the user should be able to edit a previous messages or undo the latest message and this should clean all edits that
has been done"). Every decision below was asked, with the recommended option chosen each time. It amends plan 08 §8.1,
§8.5 (`fs`), §8.6, and §8.7, and ADR 0053 (4: the 20 kept copies).

## Context

A person could take back one file at a time (the Changes view's Undo, ADR 0093, 2) and copy a chat up to a message
(`session.fork`), but not take back what they asked: a message sent in haste, or one whose answer went the wrong way,
stayed in the chat with every change it caused. `file-backups` kept a chat's newest 20 changes, files up to 1 MB, with
no link to the message they followed, so "everything after this message" couldn't be found, and the agent's `fs undo`
deleted the copy it used.

## Decisions

1. **Rewinding to a message.** Editing or undoing a message rewinds the chat to just before it, in one command: the
   message and every message after it are removed, with the changes kvman's `fs` made after it when the person asks.
   Nothing is branched or kept: the old version is gone (asked; the alternatives were ChatGPT-style branches and a new
   chat by fork). In order:
   1. **The turn stops first** (asked): a running or waiting turn is stopped as Stop does, without the `CANCELLED`
      notice, and its pending questions go with it. Edit and Undo work while the agent works; the confirmation says
      "This stops the agent.".
   2. **What started after it stops** (asked): every helper whose session was created after the message is stopped and
      deleted with its records, as deleting a chat deletes its helpers; every program worker's run started after it is
      stopped telling no one (`dropRun`) and its record deleted; and a background process the chat started after it
      keeps running, still listed under Background, but its end is never told to the chat (`quiet: true` on its
      record). A helper started before the message keeps running (asked), and its result still arrives.
   3. **Files go back** when `files` is true (§2).
   4. **What was made after it is deleted** (asked): artifacts created after the message, the execution map when it was
      first set after it, and the pieces of `fs part` saved after it. An artifact or a map that existed before it is
      left as it is now, since only its latest version is kept.
   5. **The records go**: the messages from its `seq` on (summaries among them), every queued message, and each turn
      with no message left, with its questions. The chat's `clearedThroughSeq` and `collapsedThroughSeq` move back below
      the message's `seq` (`null` when nothing is left). `nextSeq` doesn't go back, so a `seq` is never used twice, and
      the conversation, which reloads at a gap (§8.7), reads the chat whole. The totals of time and cost stay (asked):
      the tokens were spent.
   6. **The chat's views of files go**: every `file-views` record of the chat, and a running helper's records of the
      files the rewind wrote, so the agent reads a file again before it changes it; `fs read`'s unchanged answer makes
      that read short when the remaining history holds the lines.

   The agent isn't told: its history simply ends before the message. The title and the chat's settings stay.
2. **Files: kvman's own changes, back to how they were** (asked). Every `fs write`, `edit`, `undo`, and `assemble` the
   chat and its helpers made after the message is taken back, whoever made it, a helper started before the message
   included (asked). Shell lines and program workers aren't, and the confirmation says so. For each file, the changes
   after the message are taken newest first as one: when the file still holds what the newest wrote, it gets back what
   it held before the oldest, or is deleted when kvman created it after the message. A file that holds anything else
   is **left as it is** (asked; the alternatives were refusing the whole rewind and overwriting): its state is
   `changedSince`, and it is listed. A file whose content before the oldest change was over 1 MB is left too, as
   `tooLarge`. The copies of the changes taken back are deleted; with `files: false` the files and their copies stay,
   so a later rewind to an earlier message can still take them back.
3. **Copies for the chat's life** (asked; the alternatives kept 20 copies or the newest 20 messages' worth). Every change
   keeps its copy until the chat is deleted; there is no count limit. A change of a file whose previous content is over
   1 MB keeps a record with no content, `tooLarge: true`, so the rewind knows it can't restore it. `fs undo` and the
   Changes view's Undo no longer delete the copy they use: they mark it `undone` and keep a copy of their own change,
   which a later undo skips, so a rewind past an undo restores what the file held before it.
4. **Order.** Timestamps can be equal (a fake clock, or two workers in one millisecond), so each record carries
   `atSeq`, the chat's `nextSeq` when it was made, read in the transaction that makes it: a change, a helper's session,
   a program worker's run, a process, an artifact, a map, a piece. A record made after the message has `atSeq` above
   its `seq`. Copies also carry `order`, from the chat's counter `changes` (on the chat's session, raised by each
   change and undo in its transaction), which orders a file's changes exactly. A record from before this ADR has no
   `atSeq` and is after the message when its `createdAt` (or `startedAt`, `updatedAt`) is later than the message's.
5. **A stopped step changes nothing** (asked; the alternative applied it only during a rewind). A `fs write`, `edit`,
   `undo`, or `assemble` from a step that is no longer its session's current step, or from a session that is gone or
   being deleted, writes nothing and fails `VALIDATION_FAILED`: "This step was stopped, so nothing was written." The
   step is known by the call's `ctx.job.rootId`, which the session's `stepJobId` names while the step runs and its step
   intent's `jobId` names after; the check is in the change's own transaction, after the stop's. It holds for Stop too,
   where such a change used to land a moment after.
6. **The commands** (asked; the alternative was one `session.rewind` doing both). All three are for the person only,
   and on a helper's chat fail `VALIDATION_FAILED`.
   - `kvcoder.rewind.files.list { sessionId, seq }` (query) → `{ files: [{ path, state }], messages, running }`: what
     rewinding to the message would do to files, without doing it. `state` is `restore`, `delete`, `changedSince`, or
     `tooLarge`, files by path; `messages` counts the stored and queued messages it would remove; `running` is whether
     the chat isn't idle.
   - `kvcoder.message.edit { sessionId, seq, text, fileIds?, attachments?, files, sendId? }` → `{ restored, deleted,
     left }`: rewinds to the message and sends `text` as the person's message, which starts a turn and its `follow`
     chunk. `restored` and `deleted` are paths; `left` is `[{ path, reason: 'changedSince' | 'tooLarge' }]`.
   - `kvcoder.message.undo { sessionId, files }` → `{ text, fileIds, fileNames, attachments, restored, deleted, left }`:
     rewinds to the chat's latest message that may be undone and returns it, typed text, images, and attached files
     apart, for the send box.
   - **Which messages** (asked): Edit takes a message the person typed (`source.kind: 'user'`). Undo takes the latest
     message that started work: one the person typed, or one a slash command's extension sent (`source.kind:
     'extension'`, other than kvcoder's own hints). A queued message, a background result, and anything else fail
     `VALIDATION_FAILED`, and so does a `seq` the chat doesn't hold. The query takes either kind.
   - **Attachments** (asked). An edit keeps the message's images and attached files, and the person may remove them but
     not add new ones: `fileIds` must be among the message's images and `attachments` among the files its text names,
     else `VALIDATION_FAILED`. `kvcoder.message.send` takes `attachments?: string[]` too, so an undone message sent
     again names its files without copying them again: each is a path `attachments/<name>` that is a file in the
     workspace folder, resolved like an `fs` path, else `VALIDATION_FAILED`; they are named after the newly saved files
     in the message's `Attached files:` list. A send's fingerprint (ADR 0048) adds the attachments only when there are
     some, so an older receipt still matches.
   - A repeat of an edit with the same `sendId` is acknowledged, rewinding nothing, and returns empty lists.
7. **In the conversation** (asked; mockup in the question). Under a message the person typed: "Edit", "Undo" on the
   latest one that may be undone (a slash command's message has only Undo), then "Remember this". None on a queued
   message or in a helper's chat.
   - **Edit** turns the message into a box where it stands: its typed text, its images and attached files as chips with
     ×, and, while `rewind.files.list` has files to restore or delete, the box "Also undo file changes (N files)",
     checked (asked; the alternatives were always both and Claude Code's three choices). Under it, each file to be left
     with why ("changed since, will be left as it is", "too large to restore, will be left as it is"), "Shell commands'
     changes aren't undone.", "Messages after this one will be removed." when there are any, and "This stops the
     agent." while it runs. Cancel (or Esc) and "Save & send", disabled while the text is empty or sending. A failure
     keeps the box with a line saying what failed.
   - **Undo** opens the same confirmation in place, "Undo this message? It and everything after it are removed.", with
     Cancel and Undo. Afterwards the send box holds the message: its text before what the box already held (a blank
     line between), its images and attached files added to the box's chips; an attached file's chip reads its name.
   - After either, the conversation reads the chat whole, and when files were left a toast says how many.

Scenarios: `milestones/QA77-TEST-CASES.md`, written before source.
