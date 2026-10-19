# QA 62 — Context and robustness (ADR 0094)

**Asked.** The kvcoder review of 2026-10-19 (`docs/reviews/kvcoder-review-2026-10-19.md`, Phase E) found tool results
filling the context, a silent stream that holds a step ten minutes, check failures found a step late, and turns that
ended on a usage limit.

**The owner chose** every recommended option: old results cleared at both moments; the stream's silences measured
before any cut-off; a `kvcoder.check` line after changes; a `kvcoder.fallbackModel`, off by default.

Paths are relative to the repository root.

## Happy path

- **QA62-H1 old results are cleared when the cache has expired.** *Given* a chat whose results pass 40,000 tokens and
  whose last model call is over an hour old, *when* the next turn's first step runs, *then* the results older than
  the newest 40,000 tokens are sent as `[cleared to save memory: fs read big-0.txt. Make the call again if you need
  it.]`, and the newer ones whole. `extensions/kvcoder/test/clear-results.test.ts`
- **QA62-H2 old results are cleared when the prompt is half full.** *Given* a model with a small window, *when* a step
  finds over 20,000 tokens to clear and a prompt over half the window, *then* it clears them and doesn't summarize in
  that step. `extensions/kvcoder/test/clear-results.test.ts`
- **QA62-H3 a model call logs its silences.** *Then* kvai's log line at the end of a call has the model, the first
  event's time, and the longest gap, and no text of the call. `extensions/kvai/test/stream-gaps.test.ts`
- **QA62-H4 the check runs after a change.** *Given* `kvcoder.check { line: 'echo checked; exit 3' }`, *when* a reply
  edits a file, *then* the last change's result ends with `[kvman ran the check: echo checked; exit 3, exit code 3]`
  and `checked`. `extensions/kvcoder/test/check-after-edits.test.ts`
- **QA62-H5 the fallback model takes over.** *Given* `kvcoder.fallbackModel` set and a step whose model call fails
  `kvai/USAGE_LIMIT`, *then* the chat's model becomes the fallback, the notice `MODEL_SWITCHED` says from and to, and
  the step's answer comes from the fallback. `extensions/kvcoder/test/fallback-model.test.ts`

## Edge cases

- **QA62-E1 nothing is cleared too soon.** *Then* a chat under the thresholds, a turn's first step with a recent model
  call, and the newest 40,000 tokens of results are never cleared; the stored messages are unchanged.
  `extensions/kvcoder/test/clear-results.test.ts`
- **QA62-E2 a read after clearing returns the text.** *Given* a cleared `fs read`, *when* the model reads the same lines
  again, *then* it gets the content, not the unchanged answer. `extensions/kvcoder/test/clear-results.test.ts`
- **QA62-E3 no check when nothing changed, a change waited, or it failed.** *Then* a reply of reads, a change that
  waited for an approval, and a failed edit run no check, and with no setting nothing runs.
  `extensions/kvcoder/test/check-after-edits.test.ts`
- **QA62-E4 the check's limits.** *Then* its output is cut to the last 4 KB and a check past its `timeoutMs` reports
  the timeout. `extensions/kvcoder/test/check-after-edits.test.ts`
- **QA62-E5 no fallback in the wrong cases.** *Then* no setting, a fallback that is the chat's model, another failure
  code, and a fallback that fails too end the turn `STEP_FAILED` as before.
  `extensions/kvcoder/test/fallback-model.test.ts`
