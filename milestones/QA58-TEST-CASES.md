# QA 58 — Fewer failed and wasted steps (ADR 0090)

**Asked.** The kvcoder review of 2026-10-19 (`docs/reviews/kvcoder-review-2026-10-19.md`, Phase A) found steps spent on
edits refused for a repeated text, folders walked one by one, whole files read after a search, limits the model
couldn't see, a recovery action that fails again, and small display and keyboard gaps.

**The owner chose** every recommended option: `replaceAll` on `fs edit` and `artifact edit`; `fs find` newest first, 200
paths; `fs search` `context` and `filesOnly` with the default unchanged; bounding numbers cut and string limits in
signatures; "Choose another model" first after a usage, key, or rate failure; hours in durations, count labels, Esc to
stop, and Up to recall.

Paths are relative to the repository root.

## Happy path

- **QA58-H1 `replaceAll` replaces every occurrence.** *Given* a file holding `x = 1` three times, *when* `fs edit` sends
  `{ oldText: 'x = 1', newText: 'x = 2', replaceAll: true }`, *then* all three change and `replacements` is 3, while an
  edit without it in the same call still matches once. `extensions/kvcoder/test/unit/edit-text.test.ts`,
  `extensions/kvcoder/test/fs-replace-all.test.ts`
- **QA58-H2 `artifact edit` takes `replaceAll`.** *Given* an artifact holding `old` twice, *when* it is edited with
  `replaceAll: true`, *then* both change, its `version` rises by one, and `replacements` is 2.
  `extensions/kvcoder/test/fs-replace-all.test.ts`
- **QA58-H3 `fs find` lists matching files, newest first.** *Given* `src/a.ts`, `src/deep/b.ts`, `docs/c.md` with
  different modification times, *when* `fs find { pattern: '*.ts' }` and `{ pattern: 'src/**/*.ts' }` run, *then* both
  list the two `.ts` files, newest first, relative to the workspace folder, `truncated: false`; with `path: 'src'` the
  pattern `deep/*.ts` matches from `src`. `extensions/kvcoder/test/fs-find.test.ts`
- **QA58-H4 `fs search` shows lines around a match.** *Given* a file with matches on lines 5 and 7, *when* it is
  searched with `context: 2`, *then* `matches` holds lines 3 to 9 once each, in order, lines 5 and 7 without
  `context` and the others with `"context": true`. `extensions/kvcoder/test/fs-search-context.test.ts`
- **QA58-H5 `fs search` lists files only.** *When* a search runs with `filesOnly: true`, *then* each file is
  `{ path, count }`, `count` its matching lines, in path order. `extensions/kvcoder/test/fs-search-context.test.ts`
- **QA58-H6 bounding numbers are cut.** *When* `background wait` gets `timeoutMs: 900000` and `500`, `background output`
  gets `lines: 900`, and `fs read` gets `lines: 5000`, *then* each runs, as with 600000, 1000, 500, and 2000.
  `extensions/kvcoder/test/limits-cut.test.ts`
- **QA58-H7 a signature shows a string's length limit.** *Then* `execution-map set`'s signature reads
  `{ goal (≤300), steps: [{ id (≤50), title (≤100), after?, uses?, check (≤300) }] }`, a field with no limit has none,
  and `fs find` is listed in the `fs` entry of the index with `{ pattern, path? }`.
  `extensions/kvcoder/test/unit/payload-signature.test.ts`, `extensions/kvcoder/test/prompt-index.test.ts`
- **QA58-H8 the better recovery action comes first.** *Given* an idle chat whose last message is a `STEP_FAILED`
  notice with `kvai/USAGE_LIMIT`, *then* "Choose another model" is the first action and Retry the second; the same for
  `kvai/KEY_MISSING` and `kvai/RATE_LIMITED`. `extensions/kvcoder/test/web/recovery.test.ts`
- **QA58-H9 an hour reads in hours.** *Then* a call of 3,725 s reads `1 h 2 min` and a header total of 77,640 s reads
  `21 h 34 min`, in English and Arabic. `extensions/kvcoder/test/web/formats.test.ts`
- **QA58-H10 a count reads right in the singular.** *Then* an edit that made one replacement shows
  `Replaced: 1 · from line 82`. `extensions/kvcoder/test/web/result-card.test.ts`
- **QA58-H11 Esc stops the turn.** *Given* a running turn and an empty send box, *when* the person presses Esc in it,
  *then* Stop's action runs once. `extensions/kvcoder/test/web/composer-keys.test.ts`
- **QA58-H12 Up recalls the last message.** *Given* a chat whose person's last message is `fix the tests`, *when* the
  person presses Up in the empty send box, *then* the box holds `fix the tests`.
  `extensions/kvcoder/test/web/composer-keys.test.ts`
- **QA58-H13 a find call has its own line.** *Then* the closed card of `fs find { pattern: '*.ts' }` reads
  `Find *.ts 2 files`, and opened it lists the paths. `extensions/kvcoder/test/web/call-summary.test.ts`

## Edge cases

- **QA58-E1 `replaceAll` with nothing to replace is refused.** *Then* an edit with `replaceAll: true` whose `oldText`
  doesn't occur fails `edits[0] was not found…` and nothing is written. `extensions/kvcoder/test/unit/edit-text.test.ts`
- **QA58-E2 `replaceAll` counts occurrences left to right.** *Given* `aaaa` and `oldText: 'aa'`, *then* it makes 2
  replacements, as `String.replaceAll`. `extensions/kvcoder/test/unit/edit-text.test.ts`
- **QA58-E3 `replaceAll` occurrences that overlap another edit are refused.** *Given* `ab ab` with
  `{ oldText: 'ab', replaceAll: true }` and `{ oldText: 'b ab' }`, *then* the overlap is refused, naming both edits.
  `extensions/kvcoder/test/unit/edit-text.test.ts`
- **QA58-E4 `replaceAll` that changes nothing is refused.** *Then* replacing `a` by `a` everywhere fails
  `The edits change nothing in the file.` `extensions/kvcoder/test/unit/edit-text.test.ts`
- **QA58-E5 `fs find` skips what `fs search` skips.** *Given* matches in `node_modules`, `.cache`, and a Git-ignored
  file, *then* none is listed. `extensions/kvcoder/test/fs-find.test.ts`
- **QA58-E6 `fs find` stops at 200.** *Given* 201 matching files, *then* 200 are listed and `truncated` is true.
  `extensions/kvcoder/test/fs-find.test.ts`
- **QA58-E7 `fs find` refuses a file, a missing folder, and a path outside.** *Then* a file as `path` fails
  `VALIDATION_FAILED`, a missing one `NOT_FOUND`, and `..` `VALIDATION_FAILED`; no match gives `paths: []`.
  `extensions/kvcoder/test/fs-find.test.ts`
- **QA58-E8 `fs find` runs in a read-only helper.** *Given* a read-only worker's helper, *then* `fs find` runs and is in
  its prompt's index. `extensions/kvcoder/test/read-only-worker.test.ts`
- **QA58-E9 context at a file's edges, and its limits.** *Then* a match on line 1 with `context: 3` starts at line 1,
  one on the last line ends there, `context: 50` is cut to 10, context lines are cut at 500 characters, and only
  matches count toward 200. `extensions/kvcoder/test/fs-search-context.test.ts`
- **QA58-E10 `context` and `filesOnly` together are refused.** *Then* the call fails `VALIDATION_FAILED` naming both.
  `extensions/kvcoder/test/fs-search-context.test.ts`
- **QA58-E11 `filesOnly` stops at 200 files.** *Given* 201 files with a match, *then* 200 are listed and `truncated` is
  true with `reason: "matches"`. `extensions/kvcoder/test/fs-search-context.test.ts`
- **QA58-E12 other failures keep Retry first.** *Given* a `STEP_FAILED` with `kvai/PROVIDER_ERROR`, and the notices
  `REPLY_LOST`, `REPLY_INCOMPLETE`, and `INTERRUPTED`, *then* Retry is first. `extensions/kvcoder/test/web/recovery.test.ts`
- **QA58-E13 Esc does nothing else.** *Then* Esc with text in the box, with the slash list open (it hides the list),
  or with no turn to stop, doesn't stop anything. `extensions/kvcoder/test/web/composer-keys.test.ts`
- **QA58-E14 Up does nothing else.** *Then* Up with text in the box, in a chat with no message from the person, or with
  the slash list open (it moves in the list), leaves the box as it was. `extensions/kvcoder/test/web/composer-keys.test.ts`
- **QA58-E15 durations below an hour are unchanged.** *Then* 59 min 59 s reads `59 min 59 s`, exactly an hour reads
  `1 h 0 min`, and a header under an hour still reads in minutes. `extensions/kvcoder/test/web/formats.test.ts`
