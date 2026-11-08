# ADR 0122 — Idle memory: a smaller young generation per worker, and slash commands described without schemas

Status: accepted, 2026-11-08. The product owner asked for every gate to pass before M5.17 is committed, "even if it
not caused by your updates". Both decisions are the implementer's, overrulable. It amends plan 02 §2.2.

## Context

`bench:check` failed `rss.idle` (target 300 MB, plan 12 §12.3): 336 MB on the current tree, measured on Linux with
Node 24, the reference preset, and 3 workers, while the commit that recorded the baseline (`9512365d`, 292 MB)
measured 294 to 296 MB on the same machine. So the growth came from code since 30 October, about 42 MB, step by step
with the kvvideo milestones (a bisect found no single commit: runs vary by about ±10 MB).

What the measurements showed, all on the same machine, each the median of 3 to 5 runs:

- **kvvideo costs about 43 MB with 3 workers, about 4 MB with 1**: 332 to 337 MB with it, 290 to 297 without it; with 1
  worker 215 against 211. Importing kvvideo after the other extensions adds 2 MB once collected.
- **It is garbage, not memory in use**: read 20 s after the URL instead of 5 s, the same run is 209 to 213 MB (202
  without kvvideo). The two extra workers load every extension at the start and then go idle, and an idle worker
  doesn't collect; the first worker runs the start's jobs, which collects its own.
- **Much of it is `kernel.extensions.list`**, which converts every command and query of the run to JSON Schema, and
  which kvcoder's `connector.register` and `slash.register` both read; kvvideo calls both at each start. Without its
  `connector.register` call, the run is about 306 MB.

## Decisions

1. **A worker's young generation is at most 16 MB** (`resourceLimits: { maxYoungGenerationSizeMb: 16 }` on each
   `Worker`; chosen over 8 and 4, and over no limit), so the start's short-lived garbage is collected before a worker
   goes idle. Measured with the whole benchmark set, back to back on the same machine:

   | Young generation | `rss.idle` | `exec-async.noop` | `kvcoder.job.list` p50 | `kvcoder.prompt` p99 |
   |---|---|---|---|---|
   | no limit | 324 MB | 819/s | 13.9 ms | 7.2 ms |
   | 32 MB | 305 MB | 805/s | 14.2 ms | 6.9 ms |
   | 16 MB | 265 MB | 806/s | 13.4 ms | 6.9 ms |
   | 8 MB | 243 MB | 796/s | 16.7 ms | 7.1 ms |

   16 MB is the smallest size that costs nothing measurable in the other benchmarks.
2. **`kvcoder.slash.register` takes each command's description from `kernel.registrations.list`**, which carries it
   with no schema (plan 02 §2.12), instead of from `kernel.extensions.list`. Its behaviour doesn't change.
   `connector.register` still reads `kernel.extensions.list`, since a connector's signatures need its commands' input
   schemas (ADR 0108, 14).

## Consequences

- An idle kvman with the reference preset uses about 265 MB instead of 336 MB.
- The latency benchmarks (`exec.noop` p99, `http.noop`, `kvcoder.prompt`, `kvcoder.job.list`) are judged against a
  baseline recorded on a quiet machine. With the CPU governor on `powersave` and a busy desktop, the baseline commit
  itself fails them; they pass only on a machine in the baseline's conditions.
