# ADR 0096 — What `kvman start`, `stop`, and `status` print

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.8
- **Decided by**: the product owner

## Question

The plan does not say what the three lifecycle commands print or which exit codes they return. M2.14 settles output for the rest of the CLI.

## Options

1. **Short text, with JSON for `status`.**
2. JSON like the `kv` shim.
3. Human text only.

## Decision

Option 1. Problems go to stderr as `CODE: title`, followed by the hint when there is one, with exit code 1.

| Command | Prints (stdout) | Exit |
|---|---|---|
| `kvman start` | `kvman is running at http://127.0.0.1:<port> (home <path>)` | 0 |
| `kvman start` while one runs | `DAEMON_CONFLICT: Another kernel owns this home folder` (stderr) | 1 |
| `kvman status` | the `/health` JSON | 0 |
| `kvman status`, not running | `kvman is not running` | 1 |
| `kvman stop` | `kvman stopped` | 0 |
| `kvman stop`, not running | `kvman is not running` | 0 |

Under `--foreground`, the kernel's Pino lines also go to stdout, for service managers.

## Consequences

`12` §12.5 states it.
