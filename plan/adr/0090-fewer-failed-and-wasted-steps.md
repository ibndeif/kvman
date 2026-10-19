# ADR 0090 — fewer failed and wasted steps: `replaceAll`, `fs find`, search context, limits the model sees, failure actions, and small fixes

Status: accepted by the product owner on 2026-10-19 (every recommended option). It amends plan 08 §8.3, §8.5, and
§8.7, and ADR 0012, 3 (signatures), ADR 0009, 204 (the order of the two recovery actions), and ADR 0017, 2 (durations).

## Context

The kvcoder review of 2026-10-19 (`docs/reviews/kvcoder-review-2026-10-19.md`) measured the owner's chats
(6,365 model calls, 440 turns). Each finding below costs a model step, a median of 12 s, or a moment of confusion:

- 39 of the 56 failed `fs edit` calls failed because `oldText` occurred more than once; only 12 because it was not
  found. Claude Code's and opencode's edit tools both take a "replace all" flag.
- `fs list` ran 950 times, and 264 replies listed right after a reply that listed, walking a tree one folder per step;
  the model also ran `find` 43 times and `ls`/`tree` 30 times in the shell. Claude Code has Glob for this.
- 66% of reads were whole files, and 1,339 reads came right after a search: a matching line alone rarely told enough.
- `execution-map set` failed 22% of the time, mostly text past a length the signature doesn't show; `background wait`
  failed on a `timeoutMs` over its maximum, while `shell exec` cuts its own.
- After a usage-limit failure the person typed "continue" or pressed Retry, which failed the same way; the better
  action, another model, came second.
- The header showed "1294 min"; an edit card said "1 replacements"; Esc doesn't stop a turn and Up doesn't recall the
  last message, as in Claude Code.

## Decisions

1. **`replaceAll`** (asked; recommended: on `fs edit` and `artifact edit`). An edit of either may have
   `replaceAll: true`: every occurrence of its `oldText` in the text as it was is replaced, instead of the one that must
   occur once; occurrences are found from the start, each after the end of the one before, as `String.replaceAll`
   finds them. It still fails when `oldText` doesn't occur, and when any of its occurrences overlaps another edit's.
   `replacements` counts every replacement made. Without it, the rules are unchanged.
2. **`fs find { pattern, path? }`** (asked; recommended: newest first, 200 paths). It lists the files under `path`
   (the workspace folder when left out or empty) whose path matches the glob `pattern`, with `fs search`'s glob syntax
   and its rule (a pattern with `/` matches the path from `path`, one without matches the file's name), and its skips
   (`node_modules`, dot folders, and in a Git workspace what Git ignores). It returns
   `{ "paths": [...], "truncated" }`: paths relative to the workspace folder, newest modified first and by path on a
   tie, at most 200. A `path` that is a file, or outside the folder, fails as `fs search`'s does. It is the private
   query `kvcoder.fs.path.list`, never asks, and a read-only helper may run it. Its card's line is
   `Find <pattern> N files`.
3. **`fs search` `context` and `filesOnly`** (asked; recommended: both optional, the default unchanged).
   `context` (0 to 10) adds that many lines before and after each match to its file's `matches`, in line order, each
   marked `"context": true`; lines shared by two matches appear once. Only real matches count toward the 200.
   `filesOnly: true` returns `{ "path", "count" }` per file in place of `matches`, where `count` is the file's
   matching lines, and the 200 then counts files. Both together fail `VALIDATION_FAILED`.
4. **Limits the model sees** (asked; recommended). The number fields that bound how long or how much (`background
   wait`'s `timeoutMs`, `background output`'s `lines`, `fs read`'s `lines`, and `fs search`'s `context`) are cut into
   their range, as
   `shell exec`'s `timeoutMs` already is, instead of failing; their descriptions say so. A signature writes a string
   field that has a maximum length as `name (≤N)`, as `goal (≤300)` or `note? (≤300)` (amends ADR 0012, 3).
5. **Failure actions** (asked; recommended). Under a failed turn whose `STEP_FAILED` notice carries
   `kvai/USAGE_LIMIT`, `kvai/KEY_MISSING`, or `kvai/RATE_LIMITED`, "Choose another model" comes first and Retry
   second; under any other, Retry stays first. None of the providers' reasons seen so far carries a reset time, and
   kvai keeps no reason for `USAGE_LIMIT`, so no reset time is shown.
6. **Small fixes** (asked; recommended: all four).
   - A duration of an hour or more reads in hours and minutes, `21 h 34 min`, in a call's card and in the header and
     a turn's line (amends ADR 0017, 2).
   - Counts are written so one reads right: kvwebui's `t` has no plural forms, so a count that would read wrongly
     in the singular becomes a label, as `Replaced: 1 · from line 82`.
   - Esc in the send box, while the box is empty, no list or menu is open, and the turn can be stopped, stops it as
     the Stop button does.
   - Up in an empty send box puts the person's last message of this chat in it, its text only.

## Consequences

- An edit of a repeated name, a search that shows enough to act on, and a file found by name each save a step.
- `fs find` gives the model a reason not to walk folders with `fs list` or the shell; the base prompt's `fs`
  description names it.
- The index's signatures grow a little; the `kvcoder.prompt` benchmark's baseline is recorded again for that number.
