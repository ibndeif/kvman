# ADR 0139 — The process supervisor

- **Status**: accepted
- **Date**: 2026-09-27
- **Milestone**: M2.6
- **Decided by**: the product owner

## Question

`03` §3.7 describes `ctx.process.spawn` but leaves these open:

- the `ProcessHandle` shape;
- how `shell.kill` (`10` §10.2) kills a detached job after its spawning invocation has ended;
- the environment and working folder of a process;
- the streams, `tail`, `logCapBytes` default and maximum, truncation marker, and live coalescing;
- who keeps the log blob alive and how the spawner reads it;
- `timeoutMs` defaults and a missing executable;
- `kernel.processes.list`'s item shape and how long ended rows are kept;
- what the `04` §4.1 DDL lacks for boot reconciliation;
- `onExit` when shutdown or forget kills a detached process;
- `kill` and `wait` after the end;
- the other members of a process group after its leader exits;
- a missing `cwd`.

## Options

- **Handle:**
  1. **`{ processId, wait(), kill() }` plus `ctx.process.kill(processId)`.**
  2. The handle only.
  3. A `kernel.process.kill` command.
- **Environment:**
  1. **The daemon's environment overlaid, with the working folder jailed.**
  2. Only `opts.env`.
  3. Any working folder.
- **Output:**
  1. **Merged streams, a 4 KB tail, 10 MB.**
  2. Separate streams.
  3. A 50-line tail.
- **Log blob:**
  1. **A kernel ref `process:<id>`.**
  2. A pending ref for the spawner.
  3. Owned by the extension at once.
- **Timeout:**
  1. **At most 24 h; a missing command exits 127.**
  2. Required, and spawn fails on a missing command.
  3. No limit.
- **List and retention:**
  1. **Shaped like `kernel.messages.list`, rows kept 7 days.**
  2. Running processes only, kept until forget.
  3. Kept 24 h.
- **`onExit` on shutdown and forget:**
  1. **Shutdown: sent at the next boot; forget: sent and awaited.**
  2. Shutdown sends it at once.
  3. Forget sends none.
- **`kill` and `wait` after the end:**
  1. **Idempotent.**
  2. `NOT_FOUND`.
- **Stragglers:**
  1. **The group ends with its leader.**
  2. Left running.
- **Missing `cwd`:**
  1. **`NOT_FOUND`.**
  2. `VALIDATION_FAILED`.

## Decision

Option 1 in every case.

### The SDK

```ts
ctx.process.spawn(options: SpawnOptions): Promise<ProcessHandle>
ctx.process.kill(processId: string): Promise<void>

type SpawnOptions = {
  command: string; args?: string[]; cwd?: string; env?: Record<string, string>;
  timeoutMs?: number;                 // at most 86,400,000
  stdin?: string;                     // written, then closed; at most 16 MB
  logCapBytes?: number;               // default 10 MB, at most 100 MB
  live?: string;                      // '<type>:<key>' of one of its own live events with text chunks
  token?: { calls: string[]; context?: Record<string, string>; delegate?: boolean };
  detached?: boolean; onExit?: string;
};
interface ProcessHandle { readonly processId: string; wait(): Promise<ProcessResult>; kill(): Promise<void> }
type ProcessResult = { exitCode: number | null; signal: string | null; logBlobId: string; tail: string; truncated: boolean; durationMs: number };
```

**Capability and where it applies**

- `spawn`, `kill`, and `wait` need the `process` capability where the invocation runs. A global invocation uses the intersection of its grants (ADR 0133).
- All three are refused in queries (`CAPABILITY_DENIED`).
- `detached: true` requires `onExit`, one of the spawner's own `internal` commands; anything else fails `VALIDATION_FAILED`.
- `live` must name one of the spawner's own live events with text chunks. Anything else fails `CAPABILITY_DENIED`, the same rule as `ctx.live`.

**Kill and wait**

- `ctx.process.kill(processId)` kills a live process the calling extension owns, spawned by any invocation. An unknown or foreign id is `NOT_FOUND`, and killing one's own ended process is a no-op.
- `handle.kill()` is the same call.
- `wait()` resolves once the process has ended. It may be called any number of times and always returns the same result.
- A non-detached process's handle works only in the invocation that spawned it.

**Environment and working folder**

- The environment is the daemon's own, without its `KVMAN_*` variables, overlaid with `env`.
- With a token, the kernel adds `KVMAN_SOCKET` and `KVMAN_TOKEN` and appends `<home>/bin` last on `PATH` itself (`12` §12.6).
- `cwd` defaults to the workspace root. A relative or absolute `cwd` must resolve inside the workspace through the realpath jail of ADR 0136, else `WORKSPACE_ESCAPE`.
- A handler without a workspace must pass an absolute `cwd`, else `WORKSPACE_INVALID`.
- A `cwd` that does not exist, or is not a folder, fails `NOT_FOUND`, and nothing is recorded.

**Gated start**

- The kernel starts `/bin/sh` in a new process group (`setsid`). The shell waits on a release pipe, then `exec`s the command with stderr joined to stdout, so the recorded PID is the command's own.
- The row is written (`processStart` read as in ADR 0088) before the release.
- If the kernel dies before releasing, the pipe closes and the shell exits without running the command.
- A missing or non-executable command still starts and exits 127, with the shell's message in the log.

**Output**

- stdout and stderr interleave into one log, `<home>/jobs/<processId>.log` (0600), and one live stream.
- At `logCapBytes` the line `[kvman: output truncated at <n> bytes]` is appended. Later output is read and discarded, and it is not streamed live either.
- `tail` is the last 4 KB of the kept output, cut on a UTF-8 boundary.
- Live chunks `{ text }` are coalesced every 100 ms, each within the 16 KB live payload limit of `02` §2.13 (the option offered said 64 KB; the plan's limit is exact). Their `run` is the spawning message, and while the invocation runs they are reset with it (`02` §2.3).

**The end of a process**

- When the main program exits, any other member of its group gets SIGTERM, then SIGKILL after 3 s. The result is final once the output pipe closes.
- Kill paths use the same SIGTERM, then SIGKILL after 3 s. They are:
  - the invocation ending, for a process that is not detached;
  - `timeoutMs`;
  - `kill`;
  - `kernel.cancel` of the spawning message while it is unfinished (detached processes included, `02` §2.9);
  - quarantine of the owner;
  - forget of the workspace;
  - shutdown.
- `timeoutMs` is optional. A detached process without it gets 24 h; a non-detached one lives until its invocation ends.
- **Reason:**
  - `exited` when the program ended by itself;
  - `killed` when the kernel killed it;
  - `kernel-restart` when boot reconciliation found it.
  - `exitCode` is `null` when a signal ended it.

**The log blob**

- On exit the log file becomes a blob (`text/plain`) held by the kernel ref `process:<processId>` (owner `kernel`) for as long as the `processes` row exists. The file is then deleted.
- `logBlobId` from `wait()` counts as received by that invocation (ADR 0134).
- `onExit`'s handler receives the ID through its payload. An extension that wants the blob later keeps it with `blobs.keep`.

**`onExit`**

- The row's end and a detached process's `onExit` command commit in one kernel unit.
- The command is sent by the kernel with idempotency key `<processId>:exit`, the spawning message's context, correlation, and causation, and the payload of `03` §3.7.
- **Shutdown** kills every group and leaves the rows `running`. The next boot's reconciliation kills whatever still matches its PID and `processStart`, marks every row still running as `killed`, finalizes its log, and sends `onExit` with reason `kernel-restart`.
- **Forget** kills the workspace's processes in its step 2. Their `onExit` commands (reason `killed`) are admitted and awaited like `onAbort` (ADR 0122) before step 3 deletes the rows.

**`kernel.processes.list`**

- Request `{ extension?, state?, limit? }`; result `{ items, total }`, newest first. `limit` defaults to 200, at most 1,000.
- An item holds `processId`, `extension`, `messageId`, `workspaceId?`, `command`, `pid`, `state` (`running` | `exited` | `killed`), `detached`, `startedAt`, `endedAt?`, `exitCode?`, `signal?`, `reason?`, and `logBlobId?`. It never holds args, env, stdin, or output.
- An extension sees its own processes; another extension's need `kernel.admin` (people and the kernel see all). A process caller is refused `CAPABILITY_DENIED`.
- Ended rows and their `process:<id>` refs are deleted 7 days after `endedAt`, by the housekeeping step that runs with blob GC every 10 minutes.

## Consequences

- **Kernel schema 4** adds these columns to `processes`: `ws`, `command`, `detached`, `on_exit`, `signal`, `reason`, `truncated`, and `spawned_by`. `spawned_by` holds the spawning message's envelope without its payload, so boot can send `onExit` with its context and correlation.
- **Plan corrections:**
  - `03` §3.7 gains the shapes and rules above.
  - `04` §4.1 shows the new columns.
  - `04` §4.4 and §4.9 name the `onExit` wait and the process retention.
  - `05` §5.4 gains the signatures.
  - `03` §3.8's `kernel.processes.list` row gets its shape.
