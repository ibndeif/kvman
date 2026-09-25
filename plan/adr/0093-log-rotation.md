# ADR 0093 — Kernel log rotation

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.8
- **Decided by**: the product owner

## Question

`13` §13.3 rotates `logs/kernel.log` daily and at 50 MB and keeps 14 files, but Pino, the logger D55 names, does not rotate files itself.

## Options

1. **The kernel's own rotating stream.**
2. Add the `pino-roll` dependency.
3. No rotation until M7.

## Decision

Option 1, with no new dependency:

- A kernel module writes Pino's lines to `kernel.log`. At a day change, or when the next line would pass 50 MB, it renames the file to `kernel.<yyyy-mm-dd>.<n>.log`, reopens `kernel.log`, and deletes all but the 14 newest rotated files.
- Fastify's own logger is off. The kernel logs each request as method, route pattern, status, and duration, never the URL's query, headers, or body.
- Under `--foreground` the same lines also go to stdout (ADR 0096).

## Consequences

`13` §13.3 states it.
