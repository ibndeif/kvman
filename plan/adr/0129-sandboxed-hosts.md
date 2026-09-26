# ADR 0129 — Sandboxed hosts

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.4
- **Decided by**: the product owner

## Question

`03` §3.5 and ADR 0002 start sandboxed hosts with `--permission`, read access to "exactly the files they need", and `--no-experimental-sqlite`. The plan does not say:

- whether a grant (`files.read`, `files.write`, `process`, `network`) widens those flags;
- what a handler gets when the permission model blocks it (`06` §6.2 names only native addons: `CAPABILITY_DENIED`);
- what environment and output streams the process gets;
- whether a frame from the process has a size limit.

## Options

- **Flags:**
  1. **Never widened by a grant.**
  2. `files.read`/`files.write` add the workspace folders, `process` adds `--allow-child-process`.
- **Blocked operations:**
  1. **All `CAPABILITY_DENIED`.**
  2. Only native addons; the rest are unexpected errors (`INTERNAL`).
- **Environment:**
  1. **Empty; stdin, stdout, and stderr ignored.**
  2. PATH, HOME, LANG, and TZ only.
  3. The daemon's environment, with stderr's tail logged on a crash.
- **Frame size:**
  1. A 64 MB cap per frame.
  2. **No cap.**

## Decision

The bold options.

**Flags.** A sandboxed host starts with exactly:

- `--permission`;
- `--allow-fs-read` for its extension's snapshot folder and for the kernel's runtime packages (the kernel, `@kvman/sdk`, `@kvman/protocol`, and `zod`, the same roots as the install loader);
- `--no-experimental-sqlite`.

No grant adds a flag. Files, processes, and the network are reached only through `ctx`, where the kernel checks them (the realpath jail and trust gate, `07` §7.2). `~/.kvman` stays unreachable even when a workspace folder contains it. Once the running Node supports network permissions (R-Q2), network access is denied to the process without any change, because no `--allow-net` is ever passed.

**Blocked operations.** An error with code `ERR_ACCESS_DENIED` or `ERR_DLOPEN_DISABLED` that ends a handler becomes `CAPABILITY_DENIED`, which is not retried. The detail names the operation (a file read, a file write, a child process, a worker, a native addon) and never the path.

**Environment.** The process gets an empty environment, so none of the daemon's variables (API keys, tokens) reach extension code. stdin, stdout, and stderr are ignored. Frames travel as JSON lines on their own pipe (file descriptor 3), and extensions log through `ctx.log`. When the pipe closes, the process exits, so a killed kernel leaves no host behind.

**Frame size.** A frame line has no size limit beyond the per-item limits the plan sets (payloads, kv values, read results). A line that is not valid JSON, or fails the frame schema, is the loss of the host (ADR 0067).

## Consequences

- `05` §5.7 and `03` §3.5 are corrected to state these flags and the error mapping.
- `problemOfThrown` maps the two permission codes.
- The sandboxed host shares the worker runtime; its store reads go to the read pool (ADR 0131).
