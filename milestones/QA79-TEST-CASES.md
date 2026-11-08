# QA 79 — Gates that pass on a new machine: idle memory, a stop with a page open, a still gradient on ffmpeg 6, and the thinking picker while models load (ADR 0122)

**Asked.** The owner asked for every gate to pass before M5.17 is committed, "even if it not caused by your updates".
On a freshly set-up machine (Node 24, ffmpeg 6.1, a busy desktop), the gates found the faults below.

Paths are relative to the repository root.

## Happy path

- **QA79-H1 an idle kvman stays within its memory target.** *Given* the reference preset with 3 workers, *when*
  `bench:check` reads `VmRSS` 5 s after the URL, *then* it is at most 300 MB, with each worker's young generation at
  most 16 MB (ADR 0122, 1). — `bench/idle-rss.ts`

## Edge cases

- **QA79-E1 a page asking again doesn't hold kvman open.** *Given* a client that holds a job's stream on a kept-alive
  connection and asks again each time an answer ends, as an open page does, *when* kvman gets SIGTERM, *then* it exits
  0, since during a stop a connection closes as soon as its answer ends (plan 02 §2.14). —
  `packages/cli/test/stop/stop.test.ts`
- **QA79-E2 the thinking picker waits for the model list.** *Given* a chat whose model list hasn't arrived, *when* the
  send box shows, *then* the thinking picker is disabled; once the list arrives it lists only the model's own levels
  (ADR 0087, 11). — `extensions/kvcoder/test/web/composer-pickers.test.ts`
- **QA79-E3 a still gradient on ffmpeg before 7.** *Given* a scene on the default gradient, *when* `compose` builds its
  background, *then* it is the gradient's first frame repeated (`trim=end_frame=1,loop=loop=-1:size=1`), not `speed=0`,
  which ffmpeg 6.1 refuses. — `extensions/kvvideo/test/unit/background.test.ts`
