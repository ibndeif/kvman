# ADR 0121 — The benchmark baseline re-recorded at M2.2

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.2
- **Decided by**: the product owner

## Question

M2.2's `bench:check` failed on `query.indexed`: p50 was about 7.0 ms against the 5.45 ms baseline, above the 6.54 ms limit. How should M2.2 pass its bench gate?

## Options

1. **Re-record the baseline** with `pnpm bench:record` on this machine.
2. **Keep the baseline** and leave M2.2 open until `query.indexed` is back within 20%.
3. **Move the benchmark homes to tmpfs** and re-record, which changes the method of ADR 0104.

## Decision

Option 1. `bench/baseline.json` was re-recorded at M2.2.

## Consequences

- The M1.9 baseline (ADR 0105) is replaced.
- Command round-trip is now recorded at about 2.35 ms, because this disk now syncs faster than when M1.9 was recorded.
- The gate stays sensitive to other load on the machine; run it when the machine is idle.

## Measurements

The drift is not caused by M2.2. Both builds ran from worktrees on tmpfs, one right after the other, on the same machine:

| Metric | M2.1 (6668691) | M2.2 |
|---|---|---|
| `command.round-trip.p50Ms` | 0.90 | 0.77 |
| `command.sustained.perSecond` | 3,458 | 3,508 |
| `query.indexed.p50Ms` | 7.01 | 7.00 |
| `query.indexed.p99Ms` | 10.44 | 11.41 |
| `live.latency.p50Ms` | 0.27 | 0.23 |

- **Machine:** AMD Ryzen 7 5800H, 16 threads, 27 GB, Linux 7.0.0-34, Node 24.21.0.
- **Load:** other workloads on the machine (a QEMU VM and test runs outside kvman) kept the load average between 2 and 19 during these runs.
- **Recording:** the baseline was recorded at a load average of about 2.4. The checks right after it failed on a different metric each time: `live.latency` at +40%, then `command.sustained` at −35%, while the load average was about 5.5.
- **Check at M2.3:** `pnpm bench:check` passed against this baseline with M2.3 on top of M2.2, at a load average of about 6: command p50 2.63 ms (+11.9%), sustained 2,503 per second (+1.7%), indexed query p50 7.31 ms (−2%) and p99 12.25 ms, live p50 0.30 ms and p99 0.68 ms.
