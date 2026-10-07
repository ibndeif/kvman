# QA 48 — A call's card reads as what the call did (ADR 0036)

Asked: an opened `fs edit` card that showed its payload and output as JSON, "optimize the user experience" for "all tool call types"; then "the completed background tools should also show the elapsed time"; then a picture of the artifact panel's titles squeezed to a word per line.

Every scenario is in `extensions/kvcoder/test/`.

## Happy path

- **QA48-H1 An edit's diff trims the shared lines.** *Given* `oldText` `a\nb\nc\nd\n` and `newText` `a\nB\nX\nd\n`, *then* the diff is context `a`, removed `b` and `c`, added `B` and `X`, context `d`, and its counts are 2 added and 2 removed. `web/edit-diff.test.ts`
- **QA48-H2 A closed card says what was done, to what, and the outcome.** *Given* finished calls of `fs edit`, `fs write` (created, 1229 bytes), `fs read` (from line 24, 75 lines, of 120), `fs list` (14 entries), `fs search` (9 matches in 3 files), `shell exec`, a binary's `exec`, `mcp call`, `mcp tools` (12 tools), `delegate run`, `background list` (2 runs), `background output`, `background stop`, and `artifact get`, *then* each card's second line reads as ADR 0036, 2 says (`Edit src/app.ts +2 −1`, `Write notes.md Created · 1.2 KB`, `Read src/app.ts Lines 24–98 of 120`, `List src 14 entries`, `Search markStatus 9 matches in 3 files`, `$ pnpm test`, `$ git status`, `github · list_issues`, `Tools github 12 tools`, `Delegate reviewer`, `Background runs 2 runs`, `Output j1`, `Stop j1`, `Read artifact plan`), and none shows `connector · command`. `web/call-summary.test.ts`
- **QA48-H3 An edit's card is open and shows diffs, not JSON.** *Given* a successful `fs edit` with two edits of Arabic text, *then* the card is open without a click; it shows two diffs whose removed lines come before their added lines; each line is `dir="auto"`; under them it says `2 replacements · from line 27`; and the card's text holds no `\n` written as two characters, no `"oldText"`, no `risky`, and no `firstChangedLine`. `web/call-views.test.ts`
- **QA48-H4 A write's card is open and shows the content as numbered lines.** *Given* a successful `fs write` of three lines, *then* the card is open and shows lines numbered 1 to 3. `web/call-views.test.ts`
- **QA48-H5 A read shows its lines with their real numbers.** *Given* an `fs read` from line 24, *then* the card is closed; opened, its first line is numbered 24 and the next 25. `web/call-views.test.ts`
- **QA48-H6 A list shows rows.** *Given* an `fs list` of a folder and a file of 2048 bytes, *then* the opened card has two rows, the folder's with no size and the file's with `2.0 KB`. `web/call-views.test.ts`
- **QA48-H7 A search shows its matches under each file.** *Given* an `fs search` with matches in two files, *then* the opened card shows each file's path over its matches, each numbered with its own line number. `web/call-views.test.ts`
- **QA48-H8 An `mcp call` shows its arguments and the tool's text.** *Then* the opened card has a row per argument and the text under them, and shows neither `risky` nor `timeoutMs`. `web/call-views.test.ts`
- **QA48-H9 A `delegate run` shows its task and the answer.** *Then* the opened card shows the task as text and the answer through the Markdown view. `web/call-views.test.ts`
- **QA48-H10 Any other call shows fields.** *Given* a registered connector's call whose payload has a one-line string, a number, a string of three lines, and an array of two flat objects, and whose output is a JSON object, *then* the opened card shows a row per field, the long string as a text block of three lines, the array as a table with a column per field name, and the output's fields as rows; nothing shows as JSON. `web/fields-view.test.ts`
- **QA48-H11 A long block shows 12 lines.** *Given* an `fs read` of 40 lines, *then* the opened card shows 12 lines and `Show all 40 lines`; pressed, it shows 40 and `Show fewer`; pressed again, 12. `web/call-views.test.ts`
- **QA48-H12 A risky call says so.** *Then* a call with `risky: true` has the chip `Risky`, and one with `risky: false` has none. `web/call-summary.test.ts`
- **QA48-H13 The approval card shows the same view.** *Given* a turn waiting on a risky `fs edit`, an `fs write`, a `shell exec`, and an `mcp call`, *then* each approval shows its description and the closed line of ADR 0036, 2; the edit's shows its diff, the write's its content, the `mcp call`'s its arguments, and the line's shows the whole line; and Allow and Deny still answer. `web/approval-view.test.ts`
- **QA48-H14 A finished background job's card shows how long it ran.** *Given* a job's result whose run started at 09:00:00 and ended at 09:01:09, and a subagent's that took 36 s, both in the chat's job list, *then* the first card's row ends with `1 min 9 s` and the second's with `36 s`. `web/background-time.test.ts`
- **QA48-H15 The panel's titles stay on one line.** *Given* a chat with five artifacts with long Arabic titles in a window 1280 px wide, *then* every title's tab is one line high (under 40 px), the header is under 80 px high, and the shown artifact's tab is inside the row's visible part; a title longer than 14 rem is cut and has its whole text as tooltip. `e2e/artifact-panel.test.ts`

## Edge cases

- **QA48-E1 A one-line change.** *Given* `oldText` `x = 1` and `newText` `x = 2`, *then* the diff is removed `x = 1`, added `x = 2`, with no context. `web/edit-diff.test.ts`
- **QA48-E2 At most 3 context lines each side.** *Given* texts that share 5 lines before the change and 5 after, *then* the diff has the 3 nearest the change on each side. `web/edit-diff.test.ts`
- **QA48-E3 Only added, only removed.** *Given* `newText` that is `oldText` plus a line in the middle, *then* the diff has no removed line; and the other way round, no added line. `web/edit-diff.test.ts`
- **QA48-E4 A missing last line break changes nothing.** *Then* `a\nb` and `a\nb\n` split into the same two lines. `web/edit-diff.test.ts`
- **QA48-E5 A failed call is open and shows its error first.** *Given* a failed `fs edit` (`error NOT_FOUND: missing.txt doesn't exist. Nothing was written.`), *then* the card is open, the error shows in the error block before the diff, and the closed line is `Edit missing.txt` with no outcome. `web/call-views.test.ts`
- **QA48-E6 A failed line keeps its line and output.** *Given* a `shell exec` that exits 1, *then* the card is open, shows `$ npm test` then the output, and has no error block. `web/call-views.test.ts`
- **QA48-E7 Other cards start closed, and a press toggles any card.** *Then* a successful read, list, search, line, and registered call start closed; a press on an open edit's row closes it. `web/call-views.test.ts`
- **QA48-E8 A cut list or search says so.** *Then* a `truncated` list reads `The first 1000 entries` and a `truncated` search `The first 200 matches in 12 files`. `web/call-summary.test.ts`
- **QA48-E9 A pending call has no outcome.** *Then* the closed line of an approval's `fs write` is `Write notes.md`, with no size. `web/call-summary.test.ts`
- **QA48-E10 Sizes.** *Then* 512 is `512 bytes`, 1229 is `1.2 KB`, and 3 145 728 is `3.0 MB`. `web/call-summary.test.ts`
- **QA48-E11 A registered connector keeps `connector · command`.** *Then* its closed line is `notes · add`, as is `ask text` when it failed. `web/call-summary.test.ts`
- **QA48-E12 An output that isn't what the kind returns shows as text.** *Given* an `fs read` whose result text isn't JSON, *then* the opened card shows the text as it is and the closed line has no outcome. `web/call-views.test.ts`
- **QA48-E13 Empty and nested values.** *Then* `null`, `[]`, and `{}` show a dash; an array of strings shows one per line; an object in an object shows nested rows; an output that is a JSON array of flat objects shows a table; a call with an empty payload shows no payload rows. `web/fields-view.test.ts`
- **QA48-E14 Local links stay links.** *Then* `http://localhost:5173/` in a line's output, in a text output, and in a field's text is a link that opens in a new tab. `web/call-card-links.test.ts`
- **QA48-E15 A call stored before `run` is as before.** *Then* its closed line is its command line, and opened it shows the line and the output. `web/call-card.test.ts`
- **QA48-E16 Arabic.** *Then* in an Arabic page the edit's closed line reads `تعديل`, then the path left to right, and `Show all 40 lines` reads in Arabic with the count. `web/call-summary.test.ts`
- **QA48-E17 A background card with no known run has no time.** *Given* a result whose job isn't in the list, and one whose run is there but hasn't ended, *then* neither card shows a time. `web/background-time.test.ts`
- **QA48-E18 One artifact has no row of titles.** *Then* a chat with one artifact shows its title as before. `e2e/artifact-panel.test.ts`
