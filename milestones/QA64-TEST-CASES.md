# QA 64 — a silent stream is retried (ADR 0096)

**Asked.** The kvcoder review of 2026-10-19 (`docs/reviews/kvcoder-review-2026-10-19.md`, item 6) left the cut-off for
a silent model stream to real numbers; the owner then asked for it before the silence logs existed.

**The owner chose** one 5-minute rule: no stream event for 300 s, before the first or between two, aborts the call as a
temporary `kvai/PROVIDER_ERROR` (`stream stalled`).

The timers are Vitest's fake timers: a test kernel runs kvai in a worker, where they don't reach, so these tests call
kvai's model call directly with a fake context and a scripted pi-ai stream. Paths are relative to the repository root.

## Happy path

- **QA64-H1 silence before the first event.** *Given* a stream that sends nothing, *when* 300 s pass, *then* the call
  fails `kvai/PROVIDER_ERROR { model, reason: "stream stalled", transient: true }`, and not before 300 s.
  `extensions/kvai/test/stream-stall.test.ts`
- **QA64-H2 silence between events.** *Given* a stream that sent text, *when* it is then silent for 300 s, *then* the
  call fails the same way. `extensions/kvai/test/stream-stall.test.ts`
- **QA64-H3 a slow but steady stream isn't cut.** *Given* a stream with an event every 299 s, *then* the call returns
  its answer. `extensions/kvai/test/stream-stall.test.ts`

## Edge cases

- **QA64-E1 a cancel stays a cancel.** *Given* a silent stream, *when* the job is cancelled at 100 s, *then* the call
  ends with the cancel, not `stream stalled`, and nothing fires at 300 s.
  `extensions/kvai/test/stream-stall.test.ts`
- **QA64-E2 the timer ends with the call.** *Then* after a call that answered, failed, or was cut, no timer is left.
  `extensions/kvai/test/stream-stall.test.ts`
- **QA64-E3 kvcoder retries it.** *Then* the `stream stalled` Problem has `transient: true`, the one thing kvcoder's
  retries read (QA3-H22 retries every such failure). `extensions/kvai/test/stream-stall.test.ts`
