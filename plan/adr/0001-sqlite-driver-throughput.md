# ADR 0001 — `better-sqlite3` throughput, WAL, and read-only workers

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.5
- **Decided by**: the product owner (R-Q1); measured by the implementer

## Question

R-Q1 chose `better-sqlite3` behind a driver interface and asked M0.5 to measure throughput and worker-thread use: can one writer with group commit (`04` §4.2, `03` §3.11) meet `14` §14.6 (≥ 2,000 durable commands/s) while read-only connections in worker threads serve queries?

## Decision

Keep `better-sqlite3` (13.0.3, SQLite 3.53.4) with the design of `04` §4.1–§4.2 unchanged: WAL, `synchronous=FULL`, one writer applying units of work in batched transactions with one savepoint per unit, and read-only connections in worker threads. Group commit is required: one transaction per unit is bound by fsync at about 2,000 units/s, right at the target, while batches of 64 give about 20 times that. Whether the writer stays on the main thread is decided by the M1.9 benchmarks (`03` §3.2).

## Consequences

- Risk R2 is smaller than planned: `better-sqlite3` 13 ships prebuilt binaries for linux (glibc and musl), macOS, and Windows on x64 and arm64 inside the package and has no install script, so it installs with install scripts disabled.
- M1.1 builds the commit pipeline as planned; M1.9 turns this measurement into the stored benchmark baseline.

## Measurements

- **Machine**: AMD Ryzen 7 5800H (16 threads), NVMe SSD with ext4, Linux, Node v24.21.0. It is faster than the 4-core reference machine of `14` §14.6; M1.9 sets the baseline.
- **Method**: a file database on the SSD (a first run on tmpfs was discarded: fsync costs nothing there). One unit of work = insert one `messages` row (a 250-byte payload) plus upsert one `docs` row. Pragmas: `journal_mode=WAL`, `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000`. Readers are 4 worker threads, each with its own `readonly` connection, running an indexed query (`json_extract` expression index, `LIMIT 50`) in a loop for 3 s while the writer commits.

| Measure | Result |
|---|---|
| One transaction per unit | 2,023 units/s |
| Group commit, 64 units per transaction, one savepoint each | 40,979 units/s; batch commit p50 1.43 ms, p99 4.95 ms |
| The same with 4 reader threads running | 35,799 units/s; batch commit p99 5.90 ms |
| Reader queries (4 threads, during writes) | 491,249 queries; p50 0.019 ms, p99 0.045 ms |
