# 0047 — Explicit local candidate checks

## Decision

KVC34's selected local gate organization moves repository-wide subprocess gates out of Vitest. Run `node release/candidate/local-candidate-main.ts` explicitly from the repository on Node 24. The internal runner executes `pnpm run typecheck`, `lint`, `test`, `build`, then verifies the four original package names and emitted JavaScript/declaration entries, then executes `bench:check`. Each script runs once, serially; the first nonzero exit, spawn error, signal, missing file, or name mismatch stops the candidate. No retries, timeout increases, or benchmark threshold changes.

Vitest retains lightweight structural, negative, and isolated native subprocess coverage of the runner, not nested repository gates. The original four packages remain sdk (`@kvman/sdk`, index), kernel (`@kvman/kernel`, index), cli (`kvman`, main), and testkit (`@kvman/testkit`, index); both `.js` and `.d.ts` emissions are required.

## Scope and limits

This is an internal root tool, not a public kvman command, SDK API, or stored-data change. Existing package scripts, CI, desktop/release workflows, publishing, versioning, and tag staging are unchanged. Users can still bypass local checks; this is not a CI or publish blocker.

Output identifies the actual host OS/architecture and each attempted gate's status. Success certifies only this local pipeline on that host. Windows/macOS native execution, Rust checks, and installers remain unchecked unless separately run and recorded; simulated OS branches do not certify native execution.

During this implementation only targeted tooling tests run on the actual host. The full candidate pipeline is deferred until all parallel modifications are complete. No full typecheck, build, benchmark, Rust, or installer result is claimed. Focused evidence and outstanding checks are recorded in `docs/reviews/kvcoder-issues-and-improvements-2026-10-09.md`.
