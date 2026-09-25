# ADR 0087 — The daemon entry and its start report

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.8
- **Decided by**: the product owner

## Question

`kvman start` runs the kernel as the daemon (`12` §12.5), but `@kvman/cli` may import only `@kvman/protocol` (`01` §1.5). The plan does not say how the CLI launches the kernel or how it learns that the daemon started, or why it did not (`DAEMON_CONFLICT`, `HOME_INVALID`).

## Options

1. **Spawn by path with an IPC report.**
2. The kernel ships a `kvman-daemon` bin that the CLI runs by name; failures are read from the exit code and stderr.
3. The CLI checks the home folder and the lock itself before it spawns the daemon.

## Decision

Option 1:

- `@kvman/kernel` exports a daemon script (`@kvman/kernel/daemon`). `@kvman/cli` lists `@kvman/kernel` as a runtime dependency and finds the script with `import.meta.resolve`. This resolves a path only and never imports the kernel, the same way the kernel starts `devtools` scripts.
- The CLI resolves the home folder and spawns `node <script> --home <absolute path>` (plus `--port <n>` when given, ADR 0097).
- The daemon reports its start once over Node's IPC channel, then disconnects. The report is `{ ok: true, port }` once boot has finished (`03` §3.9 step 8), or `{ ok: false, problem }`. Its schema, `daemonStartReportSchema`, lives in `@kvman/protocol`.
- **Background** (the default): the daemon is detached with stdio ignored. The CLI waits for the report, checks `GET /health`, prints, and exits, and the daemon keeps running.
- **`--foreground`**: stdio is inherited. The CLI waits for the daemon to exit and passes SIGTERM on to it.
- If the daemon exits before it reports, the CLI prints `INTERNAL` with the exit code.

## Consequences

`12` §12.5 describes the start sequence. The kernel package gains a `./daemon` export.
