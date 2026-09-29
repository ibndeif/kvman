# 12 — Testing

## 12.1 Layers

| Layer | Tool | Covers |
|---|---|---|
| Unit | vitest | pure modules (validation, argument parsing, prompt building, truncation) |
| Kernel integration | vitest + `@kvman/testkit` | jobs, workers, storage, schedules, extensions, the `kernel.*` API |
| HTTP | vitest + a real kvman child process | routes, the envelope, SSE, files, static files, Host/Origin |
| Crash | vitest + a real kvman child process | SIGKILL and restart invariants (§12.2) |
| Components | vitest + `@vue/test-utils` (`happy-dom`) | kvwebui components and view rendering |
| End to end | Playwright (Chromium) + a real kvman + the fake OpenAI server | chat streaming, questions, subagents, right-to-left |
| Performance | `bench:check` | §12.3 |

Tests are deterministic. They use fake clocks where time matters and no network: npm tests use a local registry, and LLM tests use the fake OpenAI-compatible server (§7.4). Tests never touch the real `~/.kvman`.

## 12.2 Crash invariants

Tests run kvman as a child process and SIGKILL it at moments they observe through the API: after an async job is queued, while one runs, while a turn is suspended, and during a secrets write. They then restart it and check that:

1. No queued or running async job is lost; it runs again.
2. A job that ended `succeeded`, `failed`, or `cancelled` never runs again.
3. Suspended kvcoder turns and their questions survive, and answering one continues the turn.
4. `secrets.json` is either the old file or the new one, never partial.
5. A kvcoder step interrupted by the kill ends `failed`, and its turn is marked interrupted.

There are no fault hooks in production code.

## 12.3 Benchmarks

The reference machine has 4 cores and 16 GB. `bench:check` fails on a missed target, or on a regression of more than 20% from the stored baseline. A target changes only by an ADR with measurements.

| Metric | Target | Added in |
|---|---|---|
| sync `ctx.exec` no-op (in-process) | p50 ≤ 1 ms, p99 ≤ 5 ms | M1.4 |
| collection `find`, 10k documents, equality filter | p99 ≤ 20 ms | M1.3 |
| execAsync no-op throughput | ≥ 500 jobs/s | M1.5 |
| HTTP no-op command round trip | p50 ≤ 5 ms, p99 ≤ 20 ms | M1.7 |
| cold start to URL, coder preset | ≤ 3 s | M2.5 |
| idle RSS, coder preset | ≤ 300 MB | M2.5 |
| kvcoder prompt build with 10 sections (fake model) | p99 ≤ 50 ms | M2.4 |
