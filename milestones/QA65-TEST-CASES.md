# QA 65 — fewer steps, numbered reads, and edits that point (ADR 0097)

**Asked.** The kvcoder prompt and harness review of 2026-10-20 found that the model makes one call per step, reads
files as escaped JSON with no line numbers, gets no hint where a failed edit went wrong, keeps every old write's text,
and reads a method that is mostly about maps and that contradicts itself in three places. The owner said "fix them
all", then chose the recommended option of each of the four questions (ADR 0097).

Paths are relative to `extensions/kvcoder/`.

## Happy path

- **QA65-H1 independent calls come first.** *Given* the lead's and a worker's prompts, *then* the rule that independent
  calls go in one reply, and why, comes right after each method's first line and names `fs read-files`; the lead's
  talk-as-you-work rule follows it with an example of a good reply; and the `run` tool's description says independent
  calls go in one reply as several `run` calls. `test/unit/prompt-steps.test.ts`
- **QA65-H2 several files in one call.** *Given* two files, *when* the model calls `fs read-files` with both, *then* it
  reads each under its own header as numbered lines, a blank line between them, and the call's `details` hold
  `{ files: [<fs read's object>, …] }`. `test/fs-read-files.test.ts`
- **QA65-H3 a file read-files read can be edited.** *Given* a file the chat read only with `fs read-files`, *when* it
  edits it, *then* the edit is made. `test/fs-read-files.test.ts`
- **QA65-H4 a numbered read.** *When* the model calls `fs read`, *then* it reads `<path> · lines <from>–<to> of
  <total>`, then each line as its number right-aligned to six places, a tab, and its text, and ` · read on with fromLine
  <n>` when something was left out; the call's `details` keep the JSON. `test/unit/read-text.test.ts`,
  `test/fs-read.test.ts`
- **QA65-H5 a numbered edit result.** *When* an `fs edit` succeeds, *then* the model reads `<path> · <n> replacement(s) ·
  lines <a>–<b> now read:` and the lines numbered as a read numbers them; a long change's marker is its own unnumbered
  line, the numbers after it skip the lines it hides, and the JSON says so in `skipped { afterLine, lines }`.
  `test/unit/read-text.test.ts`, `test/edit-shows-change.test.ts`
- **QA65-H6 an edit found several times names where.** *When* an `oldText` occurs 3 times, *then* the error names the 3
  lines and shows each with the line before and after, numbered, after `Nothing was written.`
  `test/unit/edit-places.test.ts`
- **QA65-H7 an edit that matches when whitespace is ignored.** *When* an `oldText` differs from the file only in
  indentation or line ends, *then* the error says it matches when whitespace is ignored at those lines, and shows them.
  `test/unit/edit-places.test.ts`
- **QA65-H8 an edit whose first line is found.** *When* an `oldText` isn't found even ignoring whitespace, *then* the
  error shows the places where its first non-empty line appears, from the line before to as many lines as `oldText`
  has. `test/unit/edit-places.test.ts`
- **QA65-H9 an old call's long text is cleared with its result.** *Given* a chat whose old results are cleared, *then*
  the calls of those results are sent with every payload string over 500 characters as `[cleared to save memory: <n>
  characters]`, and the stored calls are unchanged. `test/unit/cleared-calls.test.ts`, `test/clear-results.test.ts`
- **QA65-H10 the map's rules are in its entry.** *Then* the lead's Plan and Execute are short and point to the
  `execution-map` entry, which holds how a step names who does it, branches for workers, the skeleton and then the
  details, marking steps, and setting the map again. `test/unit/prompt-steps.test.ts`
- **QA65-H11 hints for one piece.** *Then* the lost-reply hint says to write that file in parts with `fs part` and
  `fs assemble`, and neither hint says one file or one call per reply. `test/unit/lost-reply.test.ts`
- **QA65-H12 Decide for me asks nothing.** *Given* a chat with `decides`, *then* the lead's Clarify decides and says the
  choice, Confirm the plan says what the lead understood and starts, the method has no rule to call `ask`, and the
  general method decides instead of asking. `test/unit/prompt-steps.test.ts`
- **QA65-H13 true map limits.** *Then* the `execution-map` entry gives `uses` as one name up to 60 characters or a list
  of up to 5, a step's evidence as 10 to 500 characters and its note up to 300, and a `note` up to 500.
  `test/unit/prompt-steps.test.ts`

## Edge cases

- **QA65-E1 the shared 30 KB.** *Given* three files of 20 KB each, *when* `fs read-files` reads them, *then* the first is
  read whole, the second reads what fits with where to read on, and the third reads `not read: the files before it used
  this call's 30 KB; read it in another call`. `test/fs-read-files.test.ts`
- **QA65-E2 a file that can't be read.** *Given* a missing file, a folder, a file outside the workspace, and a file that
  isn't UTF-8 among readable ones, *then* each of them reads `<path> · error <code>: <message>` and the others are read.
  `test/fs-read-files.test.ts`
- **QA65-E3 lines the chat holds.** *Given* a file the chat read with `fs read`, *when* `fs read-files` reads the same
  lines of it unchanged, *then* that file reads the unchanged text, and its `details` entry is `{ path, unchanged:
  true }`; and `fs read` of lines `fs read-files` read reads the unchanged text too. `test/fs-read-files.test.ts`
- **QA65-E4 how many files.** *Then* `fs read-files` with no file or with 11 fails `VALIDATION_FAILED` with its
  signature, and an empty `path` fails the call. `test/fs-read-files.test.ts`
- **QA65-E5 read-only helpers and the index.** *Then* a read-only helper may run `fs read-files`, it never asks, and the
  index lists `read-files { files: [{ path, fromLine?, lines? }] }` after `read`. `test/fs-read-files.test.ts`
- **QA65-E6 headers of every read.** *Then* an empty file reads `<path> · empty (0 lines)`; a `fromLine` past the end
  `<path> · no lines from line <n>: the file has <total> lines`; one line `line <n> of <total>`; a read from a column
  ` (line <n> from character <c>)`; a cut long line ` · read on with fromLine <n>, fromColumn <c>`; and a CRLF file's
  lines show without the carriage return. `test/unit/read-text.test.ts`
- **QA65-E7 an older chat's reads still count.** *Given* a stored `fs read` result from before this change, whose text
  was the JSON, *when* the same lines are read again unchanged, *then* the unchanged text is returned.
  `test/read-unchanged.test.ts`
- **QA65-E8 many matches.** *When* an `oldText` occurs 30 times, *then* the error names the first 20 lines and `and 10
  more`, and shows the first 5; matches on one line name it once. `test/unit/edit-places.test.ts`
- **QA65-E9 nothing near.** *When* neither the loose text nor the first line is found, *then* the error is the exact-match
  one alone; a first line that appears in 5 places shows 3 and says `and 2 more`. `test/unit/edit-places.test.ts`
- **QA65-E10 shown lines are capped.** *Then* a shown place holds at most 20 lines, and a shown line at most 200
  characters, ended with `…`. `test/unit/edit-places.test.ts`
- **QA65-E11 artifacts point too.** *When* an `artifact edit` is found twice, *then* its error names both lines.
  `test/unit/edit-places.test.ts`
- **QA65-E12 what clearing keeps.** *Then* a string of exactly 500 characters is kept and one of 501 is cleared, strings
  inside arrays and objects (`edits[].newText`) are cleared, and a call whose result isn't cleared is sent whole.
  `test/unit/cleared-calls.test.ts`, `test/clear-results.test.ts`
- **QA65-E13 a call named for read-files.** *Then* `fs read-files` is named `fs read-files <path>, <path>` where no card
  shows it, as a cleared result names it. `test/unit/cleared-calls.test.ts`
- **QA65-E14 without Decide for me.** *Then* the method of a chat without `decides` keeps its Clarify, Confirm the plan
  with `ask choice`, and the rule to call `ask`. `test/unit/prompt-steps.test.ts`
- **QA65-E15 the card of read-files.** *Then* a `fs read-files` card's closed line is `Read <paths> <n> files`, and open
  it shows each file's path with its numbered lines, its error, or that it wasn't read or was unchanged.
  `test/web/call-views.test.ts`
