# ADR 0104 — Benchmark scope and method in M1.9

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M1.9
- **Decided by**: the product owner

## Question

M1.9 asks for "the targets of `14` §14.6 that apply to the kernel". Two of them need installed extensions, and M2.2 builds installing:

- idle memory with all core extensions;
- cold boot with 15 extensions.

The plan also does not say how the load reaches the kernel.

## Options

**Scope:**

1. The four targets the M1 kernel can run now.
2. The same four, plus a cold boot using the fixture extensions.

**Method:**

1. The kernel runs in a child process, and the load arrives over real HTTP and SSE from the parent.
2. The load runs in-process, with no HTTP.

## Decision

Scope 1 and method 1.

**Setup.**

- Each benchmark boots a kernel in a child process on a fresh home folder, with the benchmark fixture extension on a shared host.
- This is the same child entry the fault harness uses.
- The parent drives the kernel over `127.0.0.1` with `node:http` and a keep-alive agent. No new dependency.

**The benchmarks:**

| Benchmark | Load per round | Metrics | Target (§14.6) |
|---|---|---|---|
| `command.round-trip` | One client sends 500 no-op durable commands in sequence (`POST /commands/:type`, wait for the 200) | `p50Ms`, `p99Ms` | p50 ≤ 5 ms, p99 ≤ 25 ms |
| `command.sustained` | 64 concurrent keep-alive clients send no-op durable commands in one workspace for 5 s | `perSecond` (200 replies per second) | ≥ 2,000/s |
| `query.indexed` | A collection of 10,000 documents with an index; one client sends 500 queries whose handler filters on the indexed field | `p50Ms`, `p99Ms` | p99 ≤ 20 ms |
| `live.latency` | A handler publishes 500 live chunks, each stamped with the time it was published; one SSE client subscribed to the address records when each arrives | `p50Ms`, `p99Ms` | p99 ≤ 30 ms (the stricter reading of "≤ 30 ms") |

**Deferred.** Idle memory and cold boot are measured in M7.2, when core extensions exist.

**Where results also go.** The first measurements go into `bench/baseline.json` (ADR 0103). They also go into an ADR on the writer thread (`03` §3.2): the measurements decide whether the writer stays on the main thread.

## Consequences

- `@kvman/testkit` gets the benchmark runner and a benchmark fixture extension.
- `14` §14.6 names the M1.9 subset.
- ADR 0105 sets the round-trip p50 and sustained targets that `bench:check` enforces until M7.2 re-measures.
