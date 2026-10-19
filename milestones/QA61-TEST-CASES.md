# QA 61 — A chat you can read and review (ADR 0093)

**Asked.** The kvcoder review of 2026-10-19 (`docs/reviews/kvcoder-review-2026-10-19.md`, Phase D) found turns of about
29 cards that buried the agent's text and answer, a chat's file changes spread across cards with no view of them, and
a layout that broke at 400 px.

**The owner chose** every recommended option: one-line cards folded between the agent's text, a marked final answer; a
Changes view diffed with Git, with Undo and Commit; a chat list drawer, a send box that never covers the messages, and
icon pickers when narrow.

Paths are relative to the repository root.

## Happy path

- **QA61-H1 calls in a row fold into one row.** *Given* a turn with text, then four calls (two reads, a search, a
  shell line), then text, *then* the four are one closed row reading `Read 2 · Searched 1 · Ran 1` with their summed
  time, and pressing it shows the four cards. `extensions/kvcoder/test/web/call-folds.test.ts`
- **QA61-H2 every card starts closed.** *Then* an edit's and a write's card start closed and open with a press.
  `extensions/kvcoder/test/web/call-views.test.ts`
- **QA61-H3 the final answer is marked.** *Then* the last text of an ended turn has the final-answer mark, and earlier
  text and a running turn's text don't. `extensions/kvcoder/test/web/call-folds.test.ts`
- **QA61-H4 a chat's changes are listed and diffed.** *Given* a Git repository where the chat edited a tracked file,
  created one, and a helper of the chat changed another, *then* `kvcoder.change.list` gives the three, newest first,
  with `+A −R`, their states, and unified diffs. `extensions/kvcoder/test/change-list.test.ts`
- **QA61-H5 Undo takes a change back.** *When* the person runs `kvcoder.change.undo` on the edited file, *then* it is
  as before the chat's latest change. `extensions/kvcoder/test/change-list.test.ts`
- **QA61-H6 the Changes view.** *Given* a chat with changes, *then* the header shows "Changes (2)", pressing it opens
  the panel on Changes with each file's path, counts, and state; a press shows the diff; Undo runs
  `kvcoder.change.undo`; Commit sends "Commit these changes.". `extensions/kvcoder/test/web/changes-view.test.ts`
- **QA61-H7 the chat list is a drawer when narrow.** *Given* a page below 60 rem, *then* the list is a "Chats" button
  that opens it over the page, and Escape, a press outside, or a chat closes it.
  `extensions/kvcoder/test/web/sessions-drawer.test.ts`

## Edge cases

- **QA61-E1 what never folds.** *Then* a single call, an artifact card, an answered question, a background result, and
  a notice stay as they are, and a fold stops at each. `extensions/kvcoder/test/web/call-folds.test.ts`
- **QA61-E2 a fold with a failure, or of the running turn, starts open.** *Then* a fold holding a failed call starts
  open, one holding only the agent's invalid request doesn't, and a fold of the running turn is open.
  `extensions/kvcoder/test/web/call-folds.test.ts`
- **QA61-E3 the turn's line follows its fold.** *Given* a turn whose last message is in a fold, *then* the turn's line
  shows after the fold. `extensions/kvcoder/test/web/call-folds.test.ts`
- **QA61-E4 changes outside Git and without it.** *Then* outside a repository a changed file is diffed against the
  chat's oldest kept copy and a created one against nothing; a deleted file is `deleted`; with Git missing, `diffs` is
  false and the files are listed. `extensions/kvcoder/test/change-list.test.ts`
- **QA61-E5 a large diff is cut, and the records go with the chat.** *Then* a diff over 64 KB is cut, and deleting the
  chat deletes its `file-changes`. `extensions/kvcoder/test/change-list.test.ts`
- **QA61-E6 Undo refused.** *Then* undo of a file changed since the chat's change, or with no kept change, fails as
  `fs undo` does, and a helper session's id fails `VALIDATION_FAILED`. `extensions/kvcoder/test/change-list.test.ts`
- **QA61-E7 the send box never covers the messages.** *Then* at 400, 768, and 1440 px the last message's bottom is
  above the send box, and the pickers are icons below 30 rem of conversation width.
  `extensions/kvcoder/test/e2e/narrow-layout.test.ts`
