# ADR 0055 — reading on from a cut, and a bounded, stoppable search

Status: accepted by the product owner by choice on 2026-10-12, before source. This records KVC-29. Calls that use none of the new fields behave as before.

## Decisions

1. **`fs read`** takes an optional `fromColumn`: a character position in `fromLine`, from 1, counted in whole characters. Its result gains `truncated`, and, when something was left out, `next: { fromLine, fromColumn? }`, which the model passes back as it is. A line that alone passes 30 KB is cut where a character ends, and `next` names the same line and the column after the cut; otherwise the read stops at a whole line and `next` names the following line. A read with `fromColumn` is the continuation of an earlier one: when the file no longer matches what the chat last saw of it (ADR 0053, 2), it fails `VALIDATION_FAILED` and says to read the file again from its start.
2. **`fs search`** takes two optional fields. `literal: true` matches `pattern` as plain text. `glob` limits the files searched: `*` is any run of characters but `/`, `**` any run, `?` one character; a glob without `/` is matched against the file's name, another against its path from the searched folder.
3. **Ignored files.** In a Git workspace the files searched are those Git lists as tracked or untracked and not ignored (`git ls-files --cached --others --exclude-standard`); dot folders and `node_modules` stay skipped as before. Where Git isn't there, or the folder isn't in a repository, the walk is as before.
4. **Time.** One file's matching gets at most 2 seconds and a search 10 seconds in all, enforced by running the match where it can be interrupted, so a slow expression is stopped. The result's `truncated` is then `true`, and a new `reason` says why: `matches` (the 200 limit) or `time`. What was found until then is returned.

## Verification

Scenarios M2.4-E166 to E169, written before source. The limits are parameters of the search function, so tests use short ones and never wait seconds.
