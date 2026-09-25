# ADR 0105 — Durable command latency and throughput on the M1.9 machine

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M1.9
- **Decided by**: the product owner; measured by the implementer

## Question

The first M1.9 benchmarks (ADR 0104) missed two targets of `14` §14.6 on the product owner's machine:

- the round trip of a no-op durable command: p50 target ≤ 5 ms;
- sustained durable commands: target ≥ 2,000/s.

Queries and live events passed with a wide margin.

`03` §3.2 says that if the benchmarks show commit work affecting HTTP latency, the writer moves to a storage thread.

## Options

1. **Keep `synchronous=FULL`, optimize, and set the two missed targets from the measurements.**
2. **`synchronous=NORMAL`.** A commit would no longer wait for fsync. A power cut could lose the last acknowledged commits.
3. **The storage thread of `03` §3.2.**
4. **Pause** until the disk is freed, then re-measure.

## Decision

Option 1.

**Durability is unchanged.** The pragmas of `04` §4.1 are unchanged, and every commit is still fsynced.

**Three optimizations**, none of which changes behavior:

- **Claims ride the batch that stored their messages.** Inside a batch's transaction, before `COMMIT`:
  - the batch's messages join the pending index;
  - the scheduler claims every runnable message, including them.
  
  Their dispatch follows the commit, so a claim is still durable before its message reaches a host (ADR 0091). A batch that rolls back takes its messages out of the index and puts its claims back.
  
  **Effect:** a lone durable command costs 2 fsyncs (admission with claim, then the handler's unit) instead of 3.
- **Group commit flushes at the end of the event-loop turn**, or at 64 units, instead of after a fixed 2 ms. While a commit blocks the thread, the next batch gathers. The `≤ 2 ms` bound still holds whenever the thread is free.
- **Prepared statements are cached** per connection, keeping the 500 most recently used. Preparing was 14% of the main thread's time.

**The storage thread is not built now.** The measurements do show commit work affecting HTTP latency, but only through the fsync cost of this disk: blocking fsync is 56% of the main thread's time at full load. M7.2 re-measures on the reference machine, and the storage thread (`03` §3.2) is the next step if the goals of §14.6 are missed there.

**Targets that `bench:check` enforces from M1.9 on:**

| Metric | §14.6 goal | M1.9 target |
|---|---|---|
| `command.round-trip.p50Ms` | ≤ 5 ms | ≤ 10 ms |
| `command.round-trip.p99Ms` | ≤ 25 ms | ≤ 25 ms |
| `command.sustained.perSecond` | ≥ 2,000/s | ≥ 1,000/s |
| `query.indexed.p99Ms` | ≤ 20 ms | ≤ 20 ms |
| `live.latency.p99Ms` | ≤ 30 ms | ≤ 30 ms |

## Consequences

- **Kernel changes:**
  - `CommitPipeline` takes a batch-scoped `PendingSink` through `attach`. The scheduler attaches `BatchClaims`; a lone `PendingIndex` stages its entries until commit.
  - The `maxBatchDelayMs` option is gone.
  - The better-sqlite3 driver caches statements.
- **Fault harness:** at `admit.after-commit`, the batch's messages are already `running`, because they were claimed in the same transaction. A restart counts that crash as an attempt.
- **Plan corrections:**
  - `03` §3.2 and §3.11;
  - `04` §4.2 (the pipeline diagram);
  - `14` §14.6 (the M1.9 targets).

## Measurements

**Machine:**

- AMD Ryzen 7 5800H with 16 threads and 26 GB RAM, Linux 7.0, Node 24.21.0.
- An NVMe SSD with ext4, 92% full.
- Benchmark homes are on that disk, never on tmpfs.

**Raw commit cost.** One `INSERT` per `BEGIN IMMEDIATE … COMMIT`, WAL, `synchronous=FULL`, 500 commits:

- p50 3.35–3.64 ms, p99 5.5–6.8 ms;
- 272–293 commits/s over four runs.

ADR 0001 measured about 2,000/s on this machine at M0.5, so the disk's fsync cost has changed since.

**Benchmarks (ADR 0104),** medians of 5 rounds, in the order they were made:

| Code | round-trip p50 | round-trip p99 | sustained |
|---|---|---|---|
| M1.8 pipeline: a claim per transaction, 2 ms group-commit timer | 7.18 ms | 10.21 ms | 789/s |
| Claims of one scheduler pass in one transaction | 16.17 ms | 21.66 ms | 890/s |
| The same with `synchronous=NORMAL` (probe, not adopted) | 5.62 ms | 11.91 ms | 1,490/s |
| End-of-turn flush (probe) | 11.87 ms | 18.08 ms | 947/s |
| Claims in the batch's transaction, end-of-turn flush | 8.41 ms | 13.55 ms | 944/s |
| The same with the statement cache (adopted) | 8.10 ms | 11.75 ms | 1,375/s |

**Reading the table:**

- **Fsync cost varied during the session.** The first row came before the disk's fsync cost reached the 3.5 ms measured above.
- **In isolation,** a no-op command on tmpfs costs 5.8 ms with the 2 ms timer. `GET /health` costs 0.28 ms, and a query 0.4–0.7 ms.
- **Under load,** a CPU profile of the kernel process shows `COMMIT`/`BEGIN` (`exec`) at 56% of main-thread time. That is the fsync, and it is the bound on sustained throughput.
- **The adopted configuration:** queries stay at p99 7–8 ms and live events at p99 0.6–0.7 ms.
