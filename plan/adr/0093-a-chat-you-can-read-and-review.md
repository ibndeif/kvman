# ADR 0093 — a chat you can read and review: turns that read as a story, a Changes view, and narrow widths

Status: accepted by the product owner on 2026-10-19 (every recommended option). It amends plan 08 §8.4, §8.5, §8.6, and
§8.7, and ADR 0036, 5 (edit and write cards start closed).

## Context

The kvcoder review of 2026-10-19 (`docs/reviews/kvcoder-review-2026-10-19.md`, Phase D) looked at the owner's chats in
the UI:

- A turn holds about 29 calls. Every result is a card about 80 px high, and an edit's or a write's card starts open, so a
  stretch of one chat was 24,500 px high: the agent's narration (ADR 0089) and its final answer sit between screens of
  cards. Claude Code shows each action as one line and keeps the model's text as the thread.
- The chat made 1,524 file changes, spread across cards; nothing showed what a chat changed in one place, and only the
  agent could take a change back. Claude Code's desktop app shows a session's changes as a diff to review.
- At 400 px the chat list took half the screen, the send box covered the end of the last message, and the model picker
  was an empty button.

## Decisions

1. **A turn reads as a story** (asked; recommended: one-line cards, folded runs, a marked final answer).
   - Two or more call cards in a row, with no text, notice, question, artifact, or answered card between them, fold
     into one row: a chevron, the words `Read N · Searched N · Changed N · Ran N · Other N · Failed N` (each only when
     above 0; reads are `fs read`; searches `fs search`, `find`, and `list`; changes `fs write`, `edit`, `undo`,
     `assemble`, and `part`; runs a shell or binary line; failures are calls that failed and weren't the agent's own
     invalid request), and the run's time, the sum of its cards' times. Pressing it opens the cards in place.
   - A fold starts open when it holds a failure, or when it belongs to the turn that is running; otherwise closed.
   - Every call card starts closed, edits and writes too (amends ADR 0036, 5); a card's closed row is one line when the
     call has no stored description.
   - The last text of an ended turn, its final answer, has a mark of its own: a band in the primary color at its
     inline start.
   - A turn's line (`{time} · {cost}`) follows the fold that holds its last message.
2. **The Changes view** (asked; recommended: this chat's files, diffed with Git).
   - Each successful `fs write`, `edit`, `undo`, or `assemble` records its file in the workspace collection
     `file-changes { sessionId, path, firstAt, lastAt }` (index `sessionId`; `sessionId, path`), once per file, under the chat at
     the root, so a helper's changes count for its chat; the records are deleted with the chat. Changes made by a shell
     line aren't known, and the view says so.
   - `kvcoder.change.list { sessionId, withDiffs? }` (public query; `withDiffs: false` lists the files without running
     Git, for the header's count) → `{ files: [{ path, added, removed, diff, state }], diffs }`,
     newest first, at most 200: `state` is `changed`, `created`, or `deleted`; in a Git repository a tracked file is
     diffed against `HEAD`, and otherwise the file is diffed against the oldest copy the chat's backups keep, or against
     nothing for a file the chat created (`git diff --no-index`). `diff` is the unified diff, cut at 64 KB; `diffs` is
     `false` when Git can't be run, and the files are then listed without diffs.
   - `kvcoder.change.undo { sessionId, path }` (public command, the person only) takes back the chat's latest change to
     the file, by `fs undo`'s rule (it fails when the file changed since, or the chat has no kept change).
   - The conversation's header has the button "Changes (N)" while the chat has changes; it opens the panel on
     **Changes**, which is also an entry of the panel's list after the map. It lists each file with its path, `+A −R`,
     and its state, opens its diff with a press, and has Undo; "Commit" sends "Commit these changes." as the person's
     message, so the agent writes the commit and it is approved as any risky call is.
3. **Narrow widths** (asked; recommended: a drawer, no overlap, icon pickers).
   - Below 60 rem of page width the chat list is a button "Chats" that opens the list over the page, closed by a press
     outside, Escape, or opening a chat.
   - The send box never covers the messages: the message list ends above it at every width.
   - Below 30 rem of conversation width the model and thinking pickers show an icon with the name as their label and
     tooltip, and "Decide for me" an icon too.

## Consequences

- A long turn is a few rows: the agent's sentences, folds of calls, and the answer.
- The Changes view reads the files and runs Git when it opens and after each step, not while it is closed.
