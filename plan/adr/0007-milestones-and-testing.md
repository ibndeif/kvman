# ADR 0007 — Milestones and testing

Status: accepted, 2026-09-29. Decided with the product owner in question rounds.

1. **Milestones.** Thirteen, strictly in order. Kernel: M1.1 monorepo, M1.2 SDK, M1.3 storage, M1.4 extensions and workers, M1.5 async jobs and schedules, M1.6 workspaces, kernel API, localization, and hot reload, M1.7 HTTP, M1.8 CLI. Extensions: M2.1 kvai, M2.2 kvwebui frame, M2.3 kvwebui chat, M2.4 kvcoder, M2.5 kvdev, presets, and the walkthrough.
2. **Benchmarks.** Measured with the testkit and HTTP on a 4-core, 16 GB machine. `bench:check` fails on a miss, or on a regression of more than 20% from the stored baseline. A target changes only by an ADR with measurements. Each benchmark is added in the milestone that builds the part it measures.
   - sync `ctx.exec` no-op: p50 ≤ 1 ms, p99 ≤ 5 ms
   - HTTP no-op command: p50 ≤ 5 ms, p99 ≤ 20 ms
   - execAsync no-op: ≥ 500 jobs/s
   - collection `find`, 10k documents, equality: p99 ≤ 20 ms
   - kvcoder prompt build with 10 sections (fake model): p99 ≤ 50 ms
   - idle RSS with the coder preset: ≤ 300 MB
   - cold start to URL with the coder preset: ≤ 3 s
3. **Crash tests.** Real process kills: tests run kvman as a child process, SIGKILL it at moments observed through the API, restart it, and check the invariants. There are no fault hooks in production code.
4. **Changesets** for `@kvman/sdk`, `@kvman/testkit`, and each extension (refines ADR 0001, 71).
5. **UI tests.** `@vue/test-utils` with vitest in `happy-dom` for components and views. Playwright (Chromium only) for end-to-end flows against a real kvman with a temporary home and the fake OpenAI server. All pinned exactly.
