# 03 — Kernel

## 3.1 Responsibilities

The kernel delivers messages to handlers reliably and commits their effects atomically. Concretely it owns:

1. **Router** — admission and delivery for the three message kinds (command, query, event) and command replies.
2. **Scheduler** — lanes, priorities, concurrency limits, timers, schedules, retries, dead letters.
3. **Execution hosts** — shared pool, dedicated workers, sandboxed processes, and their supervision.
4. **Process supervisor** — `ctx.process` for OS processes.
5. **Storage engine** — SQLite, unit-of-work commit, step journal, blobs, migrations (`04`).
6. **Registry** — manifests, schemas, contributions, lookup of a type's owner and of an event's subscribers per workspace (ADR 0045), with the kernel as the always-available owner of the `kernel.*` types built so far (ADR 0061), `kernel.schema.get`, `kernel.validate` (including the naming grammar, `02` §2.4), and the per-workspace **UI registry** computed from the applied preset and the enabled manifests (`08` §8.6). It validates UI against the frame slot catalog and component specs in `@kvman/protocol`; it contains no UI code.
7. **Extension loader** — snapshots, verification, enable per workspace, hot reload, rollback (`06`).
8. **Workspaces and preferences** — identity, workspace file I/O, trust gate, applied presets and config (`07`); the user's language and theme (`08` §8.16), which are needed before any extension loads.
9. **Capabilities** — grants and enforcement on every `ctx` call and at commit.
10. **Adapters** — HTTP, SSE event stream, local socket, static shell, widget origins (`12`).
11. **Secrets** — the home-only secrets store.
12. **LLM service** — provider and model registry, model defaults, the `ctx.llm` call path, streaming relay, retries, usage (§3.12, `05` §5.11).
13. **Observability** — logs, traces, metrics (`13`).
14. **Lifecycle** — lock, boot, recovery, shutdown.

It does **not** own sessions, history, prompts, tools, provider implementations, UI pages, UI layout, or any product concept.

The kernel runs inside the **daemon**: the OS process that `kvman start` launches, one per home folder (§3.10).

## 3.2 In-process structure

```
main thread
  adapters ──▶ router ──▶ pending index (per lane queues, timer wheel) ──▶ scheduler ──▶ host manager
                  ▲                                                              │ invoke
                  │ committed messages                                           ▼
             commit pipeline (single SQLite writer, group commit) ◀── unit-of-work results
                  │
                  └──▶ live bus: event fan-out (durable, transient, live) to SSE streams, and replies to waiters
hosts (worker threads / child processes)
  extension module cache (setup re-run at load binds registered functions) · handler runtime ·
  read-only SQLite connection (not in sandboxed hosts) · ctx RPC client
```

The main thread performs only routing, scheduling, commit batching, and I/O multiplexing. It never runs extension code. If the M1.9 benchmarks show commit work affecting HTTP latency, the writer moves to a dedicated storage thread behind the same interface (ADR). M1.9 measured it (ADR 0105): the writer stays on the main thread, and M7.2 re-measures on the reference machine.

## 3.3 Router: admission

For every incoming message (from an adapter, a host, or the kernel):

1. **Validate the envelope** against `@kvman/protocol`.
2. **Assign** `id`, `source`, `createdAt`, inherited `correlationId`/`causationId`/`context`, the priority (defaults and inheritance in `02` §2.6: user-originated `interactive`, inherited from the parent inside handlers, only ever lowered by the sender), and the inherited `deadlineAt` (`02` §2.9). If the context has no `locale`, set it from the user's language preference (`02` §2.10).
3. **Resolve the type** in the registry for the message's workspace: owner extension, handler definition, lane template, schema. A workspace that has no row, or is being forgotten, → `WORKSPACE_INVALID` (the kernel's own sends, such as the continuations and `onAbort` commands of a forget's cancel, are still admitted, ADR 0122). Unknown → `TYPE_NOT_FOUND`. Owner not enabled in the workspace or quarantined → `HANDLER_UNAVAILABLE`. A message without a workspace may target only `global`-scope types (`WORKSPACE_INVALID` otherwise); a `global`-scope type (and an event type without a workspace) is resolved as global even when the message carries a workspace, and admission stores it without one; two extensions of one namespace that both resolve it fail `NAMESPACE_CONFLICT` (ADR 0048). Their owner must be enabled in at least one workspace, and the invocation runs with the intersection of the owner's grants across those workspaces (`06` §6.4).
4. **Check capabilities and access**: the source may send this kind and type (`05` §5.7, against the grants source of ADR 0052), otherwise `CAPABILITY_DENIED`. Then the command's or query's `access` (`02` §2.4): `user` requires a `user:*` source; `extensions` requires an `ext:*` or `proc:*` source; `internal` requires the owning extension's own handlers (never a process) or the kernel; `all` accepts every source. The kernel is always accepted. Otherwise `CALLER_NOT_ALLOWED`. `kernel.*` types skip the `calls` check and apply their own Who rule (§3.8, ADR 0079). Widgets send as their extension (`ext:*`). The check uses the kernel-assigned source, so it cannot be forged by extensions, processes, or widgets. An event may be published only by the extension that registered it (or the kernel), with `ctx.publish` for durable and transient events and `ctx.live` for live ones.
5. **Validate the payload** against the type's input JSON Schema from the manifest (Ajv, compiled once per type at load; draft 2020-12, `strict: false` so annotations are ignored, the kvman formats registered, ADR 0056) → `VALIDATION_FAILED` with issues. A message whose kind differs from its type's kind fails `TYPE_NOT_FOUND`; an `onReply.type` that is not the sender's own internal command fails `VALIDATION_FAILED` (ADR 0058). Render the lane from the handler's lane template (`02` §2.6). The host checks the full Zod schema again (including refinements and defaults) before the handler runs, and a command's result against its `output` schema after it returns; either failure is `VALIDATION_FAILED`, not retried (`05` §5.12, ADR 0074).
6. **Idempotency**: look up `(source, idempotencyKey)`; return the original on a digest match, `IDEMPOTENCY_MISMATCH` otherwise.
7. **Route by kind**:
   - command / durable event deliveries / continuation → inbox rows (inside the sender's unit of work, or a standalone transaction for adapter-originated messages), then the pending index.
   - query → directly to the scheduler's priority path.
   - transient event (at commit) → an unstored delivery per granted subscriber through the scheduler (never retried, lost on restart, ADR 0069) and the live bus; live event (at once) → live bus only.
   - Events go only to subscribers whose subscription is granted (`05` §5.7); live events go only to SSE clients. An event without a workspace goes once to each subscribing extension enabled in at least one workspace, whose handler runs without a workspace (ADR 0048).

Every kind then follows the same path: registry lookup → host of the handler's extension → the function bound at load (`02` §2.3). For commands and queries the kernel waits for the result and returns it to the caller in the same response; an adapter holds the HTTP request open until then (`12` §12.2). A command's inbox row commits before its handler runs, so the request can be retried with its idempotency key after a crash.

## 3.4 Scheduler

- **Pending index**: in-memory queues keyed by lane, plus a keyless queue per handler and a timer wheel for `notBefore`. Rebuilt from SQLite at boot.
- **Selection**: the next runnable message is chosen by priority class, then fair round-robin across workspaces, then across lanes, then by `seq`. `background` messages age upward after 30 s of being runnable so they are never starved. Messages without a workspace form one more participant of the workspace rotation; inside a workspace each lane queue (its head) and each handler's keyless queue (its highest class, then lowest `seq`) take turns, one message per turn (ADR 0064).
- **Limits** (checked before dispatch):
  - one in-flight message per lane
  - per-handler `concurrency` (default 16)
  - per-extension `maxConcurrency` (default 64)
  - per-host in-flight cap (default 64 async invocations per worker)
- **Queries** use a separate priority queue that bypasses lanes and command limits (they still count toward host capacity; a reserved slice of each host, default 25%, is kept for them: commands and event deliveries fill at most 75% of a host's cap, rounded down, ADR 0060). The scheduler reaches hosts through a dispatcher interface that names a message's host and reports its in-flight count and cap.
- **Timers**: `ctx.send(type, payload, { delayMs | at })` sets `notBefore`. Declared `schedules` (`every: '1h'`, cron syntax) are materialized as timer messages by the kernel (ADR 0144):
  - a schedule whose command has workspace scope runs once per workspace where the extension is enabled; one whose command is global runs once, without a workspace, while the extension is enabled somewhere;
  - a run is a command from source `kernel`, priority `normal`, with the schedule's `payload` (default `{}`) and `notBefore` at its due time;
  - each (extension, schedule, workspace) has at most one unfinished run, kept in the `schedules` table; when it ends in any terminal state the next one is created, due at the first occurrence after now, so runs never overlap and occurrences missed while the daemon was down collapse into one catch-up run at boot;
  - `every` counts from the moment the schedule became active (enable, reload, or the boot that first creates it); `cron` has five fields (`minute hour day-of-month month day-of-week`: `*`, lists, ranges, steps, month and day names, `0` or `7` for Sunday, either day field matching when both are restricted) evaluated in the machine's local time zone, where a time skipped by a DST change does not run and a repeated one runs once;
  - disable cancels the workspace's outstanding runs (and the global run when no enabled workspace is left); a quarantine leaves them pending; a reload cancels the runs of removed or changed schedules and creates runs for new or changed ones; boot creates the next run for every row whose message is finished or missing.
- **Retries**: crash, host loss, or a retryable problem → `attempts+1`, back to `pending` with backoff (retry *n* waits 1 s, 5 s, 30 s, then 30 s). `STORAGE_CONFLICT` retries immediately (up to 5 per attempt, not counted; the sixth is a counted retryable failure). Non-retryable problem → `failed`. `attempts == max` → `dead` with the stored reply `MESSAGE_DEAD` for waiters (its detail names the last attempt's code); `kernel.message.dead-lettered` event in the same transaction, in the dead message's workspace (ADRs 0059, 0061, 0062).
- **Lanes and reentrancy**: only a `running` message holds its lane. The scheduler answers whether a lane is held by an invocation or a running ancestor in its causation chain; `ctx.command` fails `LANE_REENTRANT` with it (ADR 0063).
- **Deadlines** (`02` §2.9): pending messages whose `deadlineAt` passes are failed from the timer wheel with `DEADLINE_EXCEEDED`, as are `awaiting` ones. At claim the scheduler computes the invocation deadline `min(deadlineAt, now + timeoutMs)`; a timer fires the abort signal then and ends the attempt at once, discarding what the handler returns later (ADR 0084). The outcome is `DEADLINE_EXCEEDED` (final) if the message deadline was reached, else `HANDLER_TIMEOUT` (retryable; `QUERY_TIMEOUT` for a query). After a 2 s grace without settling, the host is treated as stuck (§3.6); a stuck invocation is charged one attempt and follows the same outcome rule.

## 3.5 Execution hosts

| Mode | Where it runs | Isolation | Cost | Use for |
|---|---|---|---|---|
| `shared` | worker pool, `min(4, cores-1)` threads, each loads shared extensions lazily | a crash or runaway handler affects in-flight work on that worker | lowest | built-in extensions (default); others only when the user grants it |
| `dedicated` | one worker thread for this extension | failures contained to this extension | +1 thread (~10–30 MB) | heavy or CPU-bound extensions |
| `sandboxed` | one child process running Node with `--permission` and `--no-experimental-sqlite` | OS-level; fs/child-process/worker/addon access limited to granted capabilities | +1 process (~40 MB) while active | every non-built-in extension (default); always for builder-generated ones |

**Host protocol** (structured-clone for workers, JSON lines over IPC for processes; all frames validated):

```
kernel → host   invoke   {invocationId, extension, handler, kind, message, deadlineAt, readOnly}
host → kernel   rpc      {invocationId, call: command|query|live|delta|step.begin|step.end|store.read|
                          process.*|workspace.*|blobs.*|secrets.get|config.get|log, args}
kernel → host   rpcResult{invocationId, callId, ok, value|problem}
host → kernel   complete {invocationId, outcome: {ok, value}|{problem}|{deferred:true},
                          unitOfWork: {writes, sends, publishes, replies, blobRefs}}
kernel → host   abort    {invocationId, reason: cancelled|deadline|timeout}   (ADR 0084)
```

The frames are Zod schemas in `@kvman/protocol`; M1.6 adds `workspace`, `recorded` (ids and times to replay, ADR 0070), and `module` (entry and manifest on a worker's first invocation of an extension) to `invoke`, and `recorded` to `complete`; `blobRefs`, `abort`, and `store.read` arrive with the milestones that build them. A frame that fails validation is treated as the loss of that worker (ADR 0067), and a `ctx` call after the handler settled fails `INTERNAL` (ADR 0076).

Every `rpc` is checked against the invocation's capabilities and liveness (not cancelled, not past deadline). Sandboxed hosts have no database file access; their reads go through `rpc` (`store.read`) to the kernel's read pool (`04` §4.1), never the main thread. `delta` is used only by a provider's `complete` function (§3.12).

**Shared pool** (ADR 0071): any worker may load any shared extension; an invocation goes to the worker with the fewest in-flight invocations (on a tie, one that already loaded the extension). Workers start lazily up to the pool size (at least 1). A worker imports the extension's entry module, re-runs `setup` with a binding `ext`, and compares the recording with the registry's manifest (`EXT_MANIFEST_INVALID`, not retried, on a mismatch). Until M2.2 the entry paths are given as data. A worker that exits fails its running attempts as retryable `INTERNAL` after their live events are reset, and the pool replaces it on the next need (ADR 0067); supervision is §3.6.

**Host identity**: hosts are keyed by `(extension, isolation)`. The isolation granted in each workspace decides which host runs that workspace's messages, so an extension granted `sandboxed` in one workspace and `shared` in another runs in two hosts. Every other rule is per host.

**Idle unload**: every host (shared worker, dedicated worker, sandboxed process) stops after 10 minutes without an invocation and starts again on the next one; for a shared worker that is when every extension it loaded has been idle for 10 minutes, since Node cannot unload a module (ADR 0130). Stopping an idle host charges and redelivers nothing. Memory follows active extensions, not installed ones.

**Loader**: the install-time loader that records `setup` (`05` §5.1) is also a sandboxed process, with read-only access to the staged package only.

**Sandboxed processes** (extension hosts, the install-time loader, and the test process of `kernel.dev.build`, `11` §11.5) start with `--permission`, read access to exactly the files they need, and `--no-experimental-sqlite`. An extension host reads only its snapshot and the kernel's runtime packages, whatever its grants; it gets an empty environment, its stdin, stdout, and stderr are ignored, and its frames are JSON lines on their own pipe (ADR 0129). The flag matters: Node's permission model does not cover `node:sqlite`, which could otherwise open any file, including `kvman.db`. The permission probe of M0.5 runs in CI and fails if `node:sqlite` can be loaded in such a process (through `import`, `require`, or `process.getBuiltinModule`), so a Node upgrade that opens another way around the permission model is caught.

**Rules for handler code**: no module-level mutable state that affects results (per-host caches are allowed but must be optional); no timers or background work outside an invocation; all effects through `ctx`.

## 3.6 Supervision

- **Host crash** (worker `error`/`exit`, process exit): all in-flight invocations on it are released back to `pending` (attempt+1), and each extension running on it is charged one host failure. A new host starts on the next dispatch that needs one (ADR 0082).
- **Stuck host** (an invocation past deadline + grace): a shared or dedicated worker is terminated; a sandboxed process is killed. Collateral in-flight invocations on a shared worker are redelivered without an attempt penalty; the offending one is charged.
- **Quarantine**: an extension gets status `quarantined` for one of three reasons: `HOST_FAILURES` (charged with 3 host crashes or stuck invocations within 10 minutes), `EXT_INTEGRITY` (snapshot rehash mismatch, `06` §6.5), or `MIGRATION_FAILED` (a data migration failed part-way, `04` §4.8). It gets status `quarantined` and `quarantine_reason` in the `extensions` table and a `kernel.extension.quarantined {name, reason}` event. Presets are not edited: the extension stays listed as enabled, but the router treats it as unavailable in every workspace (`HANDLER_UNAVAILABLE`); its pending messages stay pending and are not run until the quarantine is lifted (ADR 0086) and the UI registry drops its contributions. The kernel sends an error notification (`08` §8.11) and the risk banner names it. The recovery page offers actions by reason:

  | Reason | Actions offered |
  |---|---|
  | `HOST_FAILURES` | Re-enable (`kernel.extension.unquarantine`), Rollback, Disable |
  | `EXT_INTEGRITY` | Rollback to another verified snapshot, Disable |
  | `MIGRATION_FAILED` | Retry upgrade (`kernel.extension.reload {name, digest: migrating.digest}`), Disable |
  | `EXT_MANIFEST_INVALID` | Rollback, Disable (manifest drift, ADR 0081) |

  `kernel.extension.unquarantine` is accepted only for `HOST_FAILURES`; until install (M2.2), a quarantine upserts the `extensions` row (ADR 0080); for the other reasons it fails `EXT_QUARANTINED`, because the code or data is still unusable. Any successful reload or rollback clears the quarantine, whatever its reason, and publishes `kernel.extension.unquarantined` (ADR 0145); a reload of the same digest after `EXT_INTEGRITY` fails again at the rehash. Disable in every workspace also clears it.
- **Manifest drift**: a module whose `setup` registers something different from its recorded manifest fails to load (`EXT_MANIFEST_INVALID`) and is quarantined.

## 3.7 Process supervisor (`ctx.process`)

```ts
const p = await ctx.process.spawn({
  command: 'bash', args: ['-c', script], cwd: workspacePath, env,
  timeoutMs, stdin?, logCapBytes: 10 * 1024 * 1024,
  live?: `shell.output.written:${jobId}`,        // output chunks as { text } of the spawner's live event
  token?: { calls: ['fs.file.get', 'todo.create'], context: { sessionId } }, // capability for the kv shim
  detached?: true, onExit?: 'shell.job.finish',  // background process: outlives the invocation; its end goes to onExit
});
const result = await p.wait();   // { exitCode, signal, logBlobId, tail, truncated, durationMs }
```

- Requires capability `process` (spawn, `kill`, and `wait`; refused in queries). `ProcessHandle` is `{ processId, wait(), kill() }`, and `ctx.process.kill(processId)` kills any live process the extension owns (`NOT_FOUND` for another's; a no-op once ended). `wait()` may be called repeatedly and returns the same result (ADR 0139).
- **Environment and folder** (ADR 0139): the daemon's environment without its `KVMAN_*` variables, overlaid with `env`; with a token the kernel adds `KVMAN_SOCKET`, `KVMAN_TOKEN`, and `<home>/bin` last on `PATH`. `cwd` defaults to the workspace root and must stay inside it (the realpath jail, `WORKSPACE_ESCAPE`); a global handler passes an absolute `cwd`; a missing folder is `NOT_FOUND`. `timeoutMs` is at most 24 h (a detached process without it gets 24 h); `logCapBytes` defaults to 10 MB, at most 100 MB; `stdin` is at most 16 MB.
- **Gated start**: the process is spawned in its own process group; the kernel records `{processId, pid, pgid, processStart, invocation, extension}` in the `processes` table and only then releases it to run. The kernel starts `/bin/sh`, which waits on a release pipe and then `exec`s the command, so a kernel that dies before the release leaves nothing running, and a missing command exits 127 (ADR 0139).
- Output (stdout and stderr interleaved) goes to `~/.kvman/jobs/<processId>.log` up to the cap, then is drained and discarded after the marker `[kvman: output truncated at <n> bytes]` (the process never blocks). `tail` is the last 4 KB kept; `live` chunks are coalesced every 100 ms (each within the 16 KB live payload limit) under the spawning message's run. On exit the log is finalized into a blob held by the kernel ref `process:<processId>` while the row exists; `wait()` hands its ID to the invocation (ADR 0139).
- **Kill paths** (deadline, cancel, `timeoutMs`, `kill`, the end of the invocation for a process that is not detached, forget, shutdown, owner quarantine) send SIGTERM to the group, then SIGKILL after 3 s. When the main program exits, the rest of its group is killed the same way (ADR 0139).
- **Boot reconciliation** kills any recorded group whose PID and process start time still match, then marks every process still recorded as running `killed`, finalizes its log, and sends the `onExit` of each detached one with reason `kernel-restart`. Shutdown kills the groups and leaves this to the next boot (ADR 0139).
- Processes outlive their invocation only when spawned with `detached: true` (async jobs), which requires `onExit`: one of the spawner's own `internal` commands (`VALIDATION_FAILED` otherwise). When a detached process ends for any reason (it exits, its `timeoutMs` or a cancel kills it, or boot reconciliation kills it after a kernel restart), the kernel sends that command to the spawner, durably and exactly once (idempotency key `<processId>:exit`), with the spawning message's `context` and payload `{ processId, exitCode, signal, reason: 'exited' | 'killed' | 'kernel-restart', logBlobId, tail, truncated, durationMs }`. Detached processes remain owned by the spawning extension and are reported through `kernel.processes.list`. A process that is not detached ends with its invocation; the handler learns its result from `p.wait()`.
- A token lets the process call `kv` over `kernel.sock` with exactly the granted types, and is revoked on exit. `token.calls` lists type patterns; the allowed set, re-evaluated on every call against the current grants (ADR 0140), is `token.calls` ∩ what the spawner may send, or — with `token.delegate: true` — `token.calls` ∩ what the actor that sent the current message may send (its own types, granted `calls`, and granted `tools`; for a person, only access-`all` types). Types with access `user` or `internal` are never allowed. This is how the agent's enabled tools reach the `kv` CLI inside `shell.exec` without `shell` itself holding those capabilities (`10` §10.2).

## 3.8 Kernel API (`kernel.*`)

The kernel exposes itself through the same message model and follows the naming grammar (`02` §2.4). All payload and result schemas live in `@kvman/protocol`. The kernel is available in every workspace: a `kernel.*` command or query sent without a workspace runs without one, and one sent with a workspace keeps it (ADR 0099). Kernel commands take the one dispatch path: an inbox row, the scheduler, and an in-process kernel host on the main thread that runs kernel code and commits its unit (ADR 0078).

**Who may send** (the "Who" column below):

| Code | Meaning |
|---|---|
| any | every actor; extensions need no capability |
| admin | the user, the kernel, or an extension holding `kernel.admin` |
| user | `access: 'user'`: only a person (and the kernel itself, e.g. first-run setup) |
| grant | `access: 'user'` **and** confirmed only in the shell's grant dialog (D41, `08` §8.13): views can open the dialog with `openGrantDialog`, never send the command directly. An extension with `kernel.admin` may prepare these (stage, compute previews and tokens) but never confirm them. |

Preview tokens (`kernel.trust.preview`, `kernel.preset.import.preview`) are stateless: an HMAC with a per-instance key over the previewed content digest and an expiry (10 minutes), so previews stay read-only queries. An import preview token carries the previewed preset itself, so `kernel.preset.import` needs only the token (ADR 0147). `kernel.extension.stage` and `kernel.preset.apply.stage` are commands because they download and snapshot packages; their tokens are stored with the staged snapshot and expire after 10 minutes (`CONFIRMATION_EXPIRED`).

### Queries

| Type | Payload → result | Who | Notes |
|---|---|---|---|
| `kernel.health.get` | `{}` → `{ status: 'ok' \| 'degraded', version, instanceId, processStart, uptimeMs, port, home }` | any | also `GET /api/v1/health`; `port` and `home` (the home folder path) are used by `local-guard` (`10` §10.11); `degraded` while an extension is quarantined (ADR 0092); `version` is the kernel package version and `instanceId` the lock nonce (ADRs 0088, 0089) |
| `kernel.schema.get` | `{ workspaceId?, q? }` → Schema (`12` §12.7) | any | internal types omitted; without `workspaceId`, every installed extension that is not quarantined (ADR 0111) |
| `kernel.validate` | `{ workspaceId?, manifest? \| preset? \| page? \| catalog? }` → `{ ok, issues: Issue[] }` (`ok` is false exactly when an issue has severity `error`) | any | structural checks, plus referential ones when `workspaceId` is given (`06` §6.3); M2.1 accepts `manifest`, `preset`, and `page`; M2.8 accepts `workspaceId` with the non-UI referential checks, M2.10 adds the UI ones (a `page` is checked as a preset page of the workspace), and `catalog` is refused with a hint until M2.11 (ADRs 0110, 0151, 0157) |
| `kernel.extensions.list` | `{ workspaceId? }` → `[{ name, title, icon, description, version, namespace, activeDigest, status: 'active' \| 'quarantined' \| 'needs-approval', quarantineReason?, isolation: Record<workspaceId, Isolation>, enabledIn: workspaceId[] }]` (sorted by name) | any | `needs-approval`: an installed newer version waits for grants; ADR 0119 |
| `kernel.extension.get` | `{ name }` → `{ versions: [{ digest, source, version, installedAt }], manifest, grants: Record<workspaceId, Capabilities> }` | any | versions newest first; an unknown name fails `NOT_FOUND` (ADR 0119) |
| `kernel.workspaces.list` | `{ includePreview? }` → `[{ id, path, name, kind: 'normal' \| 'preview', trusted, exists }]` (`exists: false` when the folder is gone: moved, renamed, or deleted, `07` §7.1) | any | preview workspaces only with `includePreview` |
| `kernel.workspace.get` | `{ workspaceId }` → `{ id, path, name, kind, trust: { mode, files } \| null, repoPreset }` | any | `repoPreset`: trusted and `<ws>/.kvman/preset.json` exists (ADR 0150) |
| `kernel.workspace.preset.get` | `{ workspaceId }` → `{ json }` | any | reads `<ws>/.kvman/preset.json` through the trust gate: `WORKSPACE_UNTRUSTED`, `NOT_FOUND`, or `PRESET_INVALID` when not JSON (ADR 0150) |
| `kernel.presets.list` | `{}` → `[{ id, name, description, icon, builtin, revision }]` | any | the catalog, sorted by name then id (ADR 0149) |
| `kernel.preset.get` | `{ presetId }` → `Preset` | any | |
| `kernel.preset.current.get` | `{ workspaceId }` → `{ preset: Preset, revision }` | any | the applied copy; its `config` is read from the workspace's config rows (`04` §4.7) |
| `kernel.preset.import.preview` | `{ json }` → `{ summary, issues, confirmationToken }` | any | inert (`07` §7.4); a refused preset fails with its code and every issue (ADR 0147) |
| `kernel.preset.export.get` | `{ presetId } \| { workspaceId }` → shareable preset JSON | any | fails `PRESET_UNSHAREABLE` for `dev:`/`local:` sources |
| `kernel.config.get` | `{ extension, workspaceId? }` → `{ global: { value, revision }, workspace: { value, revision } \| null, merged }` | any | secrets redacted (`••••1234`); each scope has its own revision (`07` §7.5); a missing row is `{ value: {}, revision: 0 }`, and an extension without config fails `NOT_FOUND` (ADR 0125) |
| `kernel.trust.preview` | `{ workspaceId }` → `{ files: [{ path, sha256 }], confirmationToken }` | any | |
| `kernel.trace.get` | `{ correlationId, reveal? }` → trace tree | any; `reveal` admin | payloads only with `reveal`, redacted |
| `kernel.messages.list` | `{ state?, type?, extension?, workspaceId?, correlationId?, limit? }` → `{ items, total }` | admin | stored messages, newest first; `limit` default 200, max 1,000; `total` counts all matches (no pagination: narrow with filters); items carry `id, kind, type, state, source, handler, workspaceId?, lane?, priority, attempts, correlationId, causationId?, createdAt, updatedAt, deadlineAt?, notBefore?`, never payload or result (ADR 0132) |
| `kernel.subscribers.list` | `{ workspaceId, type }` → `[{ name, namespace, title, status: 'active' \| 'quarantined', calls: string[] }]` | any | extensions enabled in the workspace that would receive the event `type` (foreign subscriptions through their grant, own-namespace and `kernel.*` ones without), sorted by name, each with its granted `calls` patterns there; read from committed grants, so it is exact at the moment of the call (used by the agent to find guards, `09` §9.5); `type` is an exact event type (ADR 0133) |
| `kernel.processes.list` | `{ extension?, state?, limit? }` → `{ items, total }` | any for its own; admin for others | newest first, `limit` 200 (at most 1,000); items carry no args, env, or output; ended rows are kept 7 days (ADR 0139) |
| `kernel.metrics.get` | `{}` → metrics (`13` §13.5) | any | |
| `kernel.llm.providers.list` | `{ workspaceId }` → `[{ id, title, extension, auth, configured }]` | any | |
| `kernel.llm.models.list` | `{ workspaceId }` → `ModelInfo[]` | any | `ModelInfo` = `ModelDef & { id, extension, source: 'static' \| 'listed' }`, by provider then id (ADR 0152) |
| `kernel.llm.defaults.get` | `{ workspaceId? }` → `{ workspace: Defaults, global: Defaults, effective: Defaults }` | any | |
| `kernel.llm.tokens.count` | `LlmRequest` → `{ tokens, exact: boolean }` | capability `llm` | the provider's `countTokens`, else `ceil(characters / 4)` with `exact: false` (ADR 0154) |
| `kernel.llm.usage.get` | `{ workspaceId?, from?, to?, groupBy?: 'model' \| 'extension' \| 'day' }` → `{ rows: [{ key, calls, input, output, cacheRead, cacheWrite, costUsd }] }` | any | ADR 0154 |
| `kernel.ui.get` | `{ workspaceId }` → `UiRegistry` | any | `08` §8.6; also `GET /ui` |
| `kernel.ui.page.get` | `{ workspaceId, pageId }` → `{ page, components }` | any | |
| `kernel.ui.translations.get` | `{ workspaceId }` → catalogs for the saved language and its fallbacks | any | |
| `kernel.user.preferences.get` | `{}` → `{ locale, theme, desktopAlerts }` | any | |
| `kernel.notifications.list` | `{ workspaceId?, unreadOnly? }` → `{ items }` | admin | the tray holds every extension's messages; at most 200 per workspace are kept (`04` §4.9), so the list is always complete |
| `kernel.notifications.count` | `{ workspaceId? }` → `{ unread, attention }` | any | |
| `kernel.dev.file.get` / `kernel.dev.files.list` | `{ project, path }` → file content / `[{ path, size }]` | admin | builder projects (`11` §11.5); jailed to the project folder (ADR 0012) |

### Commands

| Type | Payload → result | Who | Notes |
|---|---|---|---|
| `kernel.workspace.open` | `{ path }` → `{ workspaceId }` | admin | `07` §7.1; refuses paths inside `~/.kvman` (`WORKSPACE_INVALID`) |
| `kernel.workspace.rename` | `{ workspaceId, name }` → `{}` | admin | display name only |
| `kernel.workspace.forget` | `{ workspaceId }` → `{}` | user; admin for preview workspaces | deletes the record and all scoped data; never touches the folder (preview folders are deleted after the commit); registered with access `all`, the handler allowing a person, or `kernel.admin` for a preview (ADR 0150) |
| `kernel.workspace.preview.create` | `{ name, from: workspaceId }` → `{ workspaceId }` | admin | `07` §7.1, ADR 0150 |
| `kernel.trust.grant` | `{ confirmationToken, mode: 'once' \| 'always' }` → `{}` | grant | |
| `kernel.trust.revoke` | `{ workspaceId }` → `{}` | admin | |
| `kernel.extension.stage` | `{ source }` → stage result (`06` §6.2) | admin | |
| `kernel.extension.install` | `{ confirmationToken }` → `{ name, digest }` | admin | installing never enables |
| `kernel.extension.enable` | `{ workspaceId, name, grants }` → `{ revision }` | grant; admin in preview workspaces (`07` §7.1) | on an already enabled extension it replaces the grants (used to change capabilities or isolation); registered with access `all`, the handler allowing a person, or `kernel.admin` for a `dev:` source in a preview (ADR 0150) |
| `kernel.extension.disable` | `{ workspaceId, name }` → `{ revision }` | admin | `EXT_IN_USE` while required (`06` §6.4) |
| `kernel.extension.reload` | `{ name, digest?, grants?: Record<workspaceId, Capabilities> }` → `{ digest }` | admin; grant when `grants` is present | upgrade, hot reload (`06` §6.6) |
| `kernel.extension.rollback` | `{ name, digest }` → `{ digest }` | admin | `06` §6.7 |
| `kernel.extension.unquarantine` | `{ name }` → `{}` | user | clears `quarantined`; the recovery page's "Re-enable"; only for reason `HOST_FAILURES`, else `EXT_QUARANTINED` (§3.6) |
| `kernel.extension.uninstall` | `{ name, deleteData?, keepSnapshots? }` → `{}` | user | `06` §6.8 |
| `kernel.preset.import` | `{ confirmationToken }` → `{ presetId }` | grant | |
| `kernel.preset.apply.stage` | `{ workspaceId, presetId } \| { workspaceId, json }` → apply preview + `confirmationToken` | admin | `07` §7.4; with `json` the confirmed apply also imports it; version switches in other workspaces are part of the preview; the preview's shape and checks are in ADR 0148 |
| `kernel.preset.apply` | `{ confirmationToken }` → `{ revision }` | grant | |
| `kernel.preset.update` | `{ workspaceId, patch, revision }` → `{ revision }` | admin; grant when the patch touches `extensions` | `patch` is a JSON Merge Patch (RFC 7396) of the applied preset; patchable keys and `enabled` changes in ADR 0149 |
| `kernel.preset.save` | `{ workspaceId, name, description? }` → `{ presetId }` | admin | |
| `kernel.preset.delete` | `{ presetId }` → `{}` | admin | built-in presets cannot be deleted (`PRESET_READONLY`) |
| `kernel.config.set` | `{ extension, scope, workspaceId?, value, revision }` → `{ revision }` | admin | `07` §7.5 |
| `kernel.secret.set` / `kernel.secret.clear` | `{ extension, name, value }` / `{ extension, name }` → `{}` | admin | |
| `kernel.cancel` | `{ messageId } \| { correlationId }` → `{ cancelled: number }` | any for its own messages; admin otherwise | `02` §2.9 |
| `kernel.message.retry` / `kernel.message.discard` | `{ messageId }` → `{}` | admin | dead or pending messages |
| `kernel.dev.project.create` / `.delete` | `{ name, template? }` / `{ name }` → `{}` | admin | builder projects under `~/.kvman/extensions/dev/` (`11` §11.5) |
| `kernel.dev.file.write` / `.delete` | `{ project, path, content }` / `{ project, path }` → `{}` | admin | jailed to the project folder |
| `kernel.dev.build` | `{ project, test? }` → `{ ok, issues, tests?, versionId? }` | admin | compile, record the manifest, and run the tests in a sandboxed test process; records a `dev:` version when clean (`11` §11.5) |
| `kernel.dev.folder.stage` | `{ path }` → stage result (`06` §6.2) | user | used by `kvman ext dev` (`12` §12.5): stages a developer's folder (an absolute path outside the home folder) as a `dev:` source |
| `kernel.shutdown` | `{}` → `{}` | user | shutdown starts once its unit commits; `kvman stop` sends it (ADR 0090) |
| `kernel.llm.complete` | `LlmRequest` → `LlmResult` | capability `llm` | §3.12 |
| `kernel.llm.models.refresh` | `{ provider? }` → `{}` | admin | |
| `kernel.llm.defaults.set` | `{ workspaceId?, purpose, model: ModelRef \| null }` → `{}` | admin | no `workspaceId` = global default; a workspace default is a preset write (`kernel.preset.changed { cause: 'update' }`, ADR 0152) |
| `kernel.user.preferences.set` | `{ locale?, theme?, desktopAlerts? }` → `{}` | user | `08` §8.16 |
| `kernel.notification.read` / `kernel.notification.dismiss` | `{ id }` → `{}` | user | `08` §8.11 |
| `kernel.notifications.read-all` | `{ workspaceId? }` → `{}` | user | |
| `kernel.notifications.mute` | `{ workspaceId, extension, muted }` → `{}` | user | |
| `ui.toast`, `ui.notify`, `ui.dismiss`, `ui.navigate` | `08` §8.11 → `{ ok: true }` | extensions with `ui`, kernel | one-way; handled at commit |

### Events

Every extension may subscribe to `kernel.*` events without a grant. All are durable unless marked transient.

| Type | Payload | Published when |
|---|---|---|
| `kernel.started` (transient) | `{ version, instanceId }` | boot finished (§3.9) |
| `kernel.extension.installed` / `.uninstalled` | `{ name, digest? }` | install / uninstall |
| `kernel.extension.enabled` / `.disabled` | `{ workspaceId, name }` | enable (including grant changes) / disable |
| `kernel.extension.reloaded` | `{ workspaceId, name, digest }` | reload, upgrade, rollback: published once for each workspace where the extension is enabled, so subscribers can refresh per workspace |
| `kernel.extension.quarantined` / `.unquarantined` | `{ name, reason }` / `{ name }` | §3.6 |
| `kernel.preset.changed` | `{ workspaceId, revision, cause: 'apply' \| 'update' \| 'enable' \| 'disable' }` | every write to a workspace's applied preset |
| `kernel.preset.catalog.changed` | `{ presetId, cause: 'seed' \| 'import' \| 'save' \| 'delete' }` | every write to the catalog |
| `kernel.config.changed` | `{ extension, scope, workspaceId?, revision }` | config set, preset apply |
| `kernel.workspace.opened` / `.renamed` / `.forgotten` | `{ workspaceId }` | published without a workspace (ADR 0122) |
| `kernel.trust.changed` | `{ workspaceId, trusted }` | grant, revoke, or a file change that closes the gate |
| `kernel.message.dead-lettered` | `{ messageId, type, correlationId }` | §3.4; in the dead message's workspace (ADR 0061) |
| `kernel.llm.models.changed` / `kernel.llm.defaults.changed` | `{ provider? }` / `{ workspaceId? }` | §3.12 |
| `kernel.user.preferences.changed` | `{ locale, theme, desktopAlerts }` | preferences set |
| `kernel.notifications.changed` (transient) | `{ workspaceId }` | any tray change |

**`kernel.preset.changed`** is published in the same unit of work that bumps the applied preset's revision. `kernel.extension.enabled` / `.disabled` are still published for subscribers that care about one extension. The shell uses `kernel.preset.changed`, `kernel.extension.reloaded`, and `kernel.extension.quarantined` / `.unquarantined` to refresh the UI registry (`08` §8.6); there is no separate "UI changed" event, because the UI is computed from the preset and the enabled code.

**Notifications** (`08` §8.11): the kernel stores `ui.notify` in the `notifications` table (replacing by `key`, enforcing rate limits, checking action buttons like view actions) and forwards toasts and notifications to connected tabs. It notifies the person itself when an extension is quarantined, a migration or integrity check fails, or a message from a person's action is dead-lettered.

Kernel handlers run on the main thread, are short, and use the same unit-of-work commit. `kernel.llm.complete` is the exception in duration only: the kernel forwards it to a provider's host and completes it when the provider returns (§3.12).

## 3.9 Boot, recovery, shutdown

**Boot**
0. Resolve the home folder (`--home`, else `KVMAN_HOME`, else `~/.kvman`). If it holds anything other than `daemon.lock` and `logs/` but has no `kvman.db`, refuse to start with `HOME_INVALID` (R-Q4); an empty or missing folder is created (0700).
1. Bind the port, then acquire `daemon.lock` with it (§3.10, ADR 0088). HTTP requests, `/health` included, wait until step 8 finishes.
2. Open SQLite; run kernel migrations. A newer schema → refuse to start with `SCHEMA_TOO_NEW`.
3. Load secrets.
4. Verify every snapshot referenced by an enabled extension (rehash, `06` §6.5). On a mismatch the extension is quarantined with reason `EXT_INTEGRITY` (no retry, §3.6); its recovery page entry offers Rollback to another verified snapshot, or Disable.
5. Load manifests into the registry. Then finish interrupted data migrations: for every extension whose `extensions.migrating` is set, the kernel starts a migration host for that extension (migrations are extension code; the host stops when the migration ends, ADR 0143), resumes the migration from the stored data version, and completes the interrupted swap exactly as `04` §4.8 "Crash during migration" says. Failures follow `04` §4.8 (quarantine with `MIGRATION_FAILED`); boot continues either way.
6. **Recover**:
   - inbox rows `running` were interrupted by a crash: attempts + 1, then `pending`, or `dead` with `MESSAGE_DEAD` and `kernel.message.dead-lettered` when that reaches `maxAttempts` (ADR 0091);
   - step journal rows `started` → left as-is; the handler sees them on redelivery;
   - processes: reconcile and kill as in §3.7 (detached ones get their `onExit`);
   - trust records with mode `once` are cleared (`07` §7.2);
   - deferred (`awaiting`) commands keep waiting; their deadline timers are rebuilt;
   - rebuild the pending index and timer wheel.
7. Start hosts lazily: every host starts on its extension's first message.
8. Start adapters; publish `kernel.started` (transient).

First run (no `kvman.db` before step 2): after step 5 the kernel installs every builtin extension from the self-contained builtin tarballs in the kernel package, without network (`06` §6.2, §6.9), seeds the built-in presets from the kernel package's `builtin/presets/` into the catalog (`kernel.preset.catalog.changed {cause: 'seed'}`, ADR 0146), and creates and opens the Home workspace `~/kvman`. The shell's first-run screen then applies the chosen preset (`08` §8.3). On an upgrade (a newer kvman version than the one recorded in `kernel_settings` under `kvman.version`), after step 5 every bundled builtin tarball whose digest is not installed is installed as a new version; one whose package version is higher than the active version's becomes active, through a reload by the kernel where it is enabled (a reload that needs new capabilities records `pending_digest`) or by switching `active_digest` where it is enabled nowhere; a failure is logged and boot continues (ADR 0145). Built-in presets are re-seeded: every bundled one is written again, built-ins no longer bundled are deleted, and a non-built-in entry with a bundled id is replaced; applied copies are never touched (ADR 0146). Every boot ends by recording the running kvman version as `kvman.version`.

**Shutdown** (SIGTERM, SIGINT, `kernel.shutdown`): stop admitting new adapter messages → let in-flight invocations finish for up to 10 s → abort the rest: their live events are reset and their rows return to `pending` without counting an attempt, so they redeliver on next boot (ADR 0091) → kill process groups → flush the commit pipeline → close SQLite → release the lock. Shutdown is idempotent across repeated signals. From its start a command, query, or subscription request gets 503 `KERNEL_STOPPING` while `GET /health` still answers (the listener stays open until the end), a request still waiting for a reply answers `202 { id, state }`, and every event stream gets `close { reason: 'shutdown' }` (ADR 0090).

M1.8 builds steps 0–2, 6 (without trust and processes), 7, 8, and the `kvman.version` record; the other steps land with their mechanisms (ADR 0089).

## 3.10 Daemon lock and identity

- `daemon.lock` is created exclusively (0600, written to a temporary file and hard-linked into place) with `{pid, processStart, nonce, port, startedAt}` (`daemonLockSchema`); `port` is the port bound just before (4173, else the first free one in 4174–4199, or exactly `--port`, `12` §12.5; `PORT_UNAVAILABLE` when none is free), and every client finds the kernel through it. `processStart` is the opaque `ps -o lstart= -p <pid>` string read with `LC_ALL=C`; `nonce` is a UUID v4 and is the `instanceId` (ADR 0088).
- On collision: read the record; if its PID is alive with the same process start time, another kernel owns the home folder → `DAEMON_CONFLICT` (its `/health` only identifies the running instance). Otherwise (a dead PID, another start time, or a record that does not parse) take over the stale lock: rename it away, check that it is the record that was read, delete it, and retry exclusive creation.
- Release only removes the lock if the nonce still matches.

## 3.11 Performance design

- Group commit: units of work are batched until the end of the event-loop turn or 64 items (≤2 ms while the thread is free), one fsync per batch; the scheduler claims runnable messages inside each batch's transaction, so storing a message and claiming it share that fsync (ADR 0105).
- Each connection caches its 500 most recently used prepared statements (ADR 0105).
- Queries read through per-host read-only connections, or the read pool for sandboxed hosts (WAL readers never block the writer).
- Live and transient events never touch SQLite.
- The pending index lives in memory; SQLite is only read at boot.
- Targets and gates: `14` §14.6.

## 3.12 LLM service

The API extensions use is in `05` §5.11. Inside the kernel:

- **Registry**: providers and static models come from manifests (`registerProvider`, `registerModel`). Dynamic models from `listModels` are stored in the `llm_models` table with their provider and refresh time. The combined list per workspace includes only providers whose extension is enabled there. A refresh rewrites a provider's rows (ADR 0152); `PROVIDER_CONFLICT` is checked wherever namespaces are.
- **Defaults**: per purpose (`chat`, `summary`, `extension`, `child`). Workspace defaults are stored in the applied preset (`llm.defaults`); global defaults in the `kernel_settings` row `llm.defaults` (`04` §4.1). Set with `kernel.llm.defaults.set` by the user or `kernel.admin`; publishes `kernel.llm.defaults.changed`. Resolution: explicit request model → workspace default for the purpose → global default for the purpose → `LLM_MODEL_NOT_FOUND`.
- **Call path**: `kernel.llm.complete` is admitted like any command (capability `llm`, schema, idempotency). The kernel resolves the model, then invokes the provider's `complete` function in the provider extension's host with the caller's deadline and abort signal, counted against that extension's concurrency limits. `ctx.delta` text and thinking chunks from the provider are published as the caller's live events named in `live.text` and `live.thinking` (`05` §5.11), with `run` = the calling handler's message id; a provider attempt that fails is reset for that run before the retry (`02` §2.3). The provider's result becomes the command's reply.
- **Retries**: `LLM_CALL_FAILED` with `retryable` goes back through the normal retry path with backoff and the provider's `retryAfterMs`; other LLM codes fail at once.
- **Usage**: one `llm_usage` row per call (workspace, caller extension, provider, model, tokens, cost, `correlationId`), written in the command's unit of work.
- **No provider code**: the kernel depends on no provider SDK. With no provider enabled, calls fail `LLM_NOT_CONFIGURED`.
- The provider context, the unconfigured case (reported by `complete`, not a `status()` call first), retry timing (the later of the backoff step and `retryAfterMs`; other provider errors become `LLM_CALL_FAILED`), global calls, and the provider host frames are in ADR 0153.
