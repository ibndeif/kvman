# Jobs, workers, and schedules

This page is for anyone whose extension does work. When you finish, you can choose between a command and a query, call work now or later, handle failures and retries, schedule repeating work, and know what a crash does to a running job.

## Commands and queries

Everything an extension does runs as a **job**. A job runs a registered **command** or **query**.

| | Command | Query |
|---|---|---|
| Does | may write | only reads |
| `ctx.exec` (runs now, returns the output) | yes | yes |
| `ctx.execAsync` (queued, returns a job id) | yes | no: `NOT_A_COMMAND` |
| `ctx.schedule` (at a time, or on a cron) | yes | no: `NOT_A_COMMAND` |
| Writes (`store`, `files`, `settings`, `secrets`), `execAsync`, `schedule` | allowed | fail `READ_ONLY` |
| `ctx.exec` inside it | commands and queries | queries only (`READ_ONLY` otherwise) |

A name is registered once, as a command or a query, never both.

- **Sync jobs** (`ctx.exec`, and HTTP calls without `async`) run at once on a worker and leave no row.
- **Async and scheduled jobs** are rows in SQLite: `{ id, name, input, workspaceId, caller, status, attempts, retries, output?, problem?, createdAt, startedAt?, endedAt? }`, with a status of `queued`, `running`, `succeeded`, `failed`, or `cancelled`. Finished rows are deleted after `kernel.jobs.retentionDays` (default 7).
- **Ordering.** Queued jobs start first-in, first-out and run in parallel. A job you queue with `execAsync` starts only after your handler has its id. The kernel keeps no other ordering: if you need one-at-a-time, guard it in your own store.
- **Depth.** A chain of sync `ctx.exec` calls deeper than 16 fails `TOO_DEEP`.

## Workers

The kernel runs a pool of `worker_threads`, `kernel.workers` of them (your CPU cores minus 1, at least 1). Every worker loads every extension, and any job runs on any free worker. A worker runs up to `kernel.workerConcurrency` (32) jobs at once, since handlers mostly wait on I/O.

Inside a handler, `ctx.store`, `ctx.files`, `ctx.settings`, `ctx.secrets`, and the job calls use that job's workspace and caller. **Handlers keep no in-memory state between jobs**: anything that must last goes in the store.

## Work ends with its job

A handler's in-process work ends when it returns. Long or repeated work goes to `execAsync` or `ctx.schedule`, never to `setTimeout`, `setInterval`, or an unawaited promise. Long-lived child processes use `ctx.processes`. `kvman-check` warns about `setInterval` and unawaited `setTimeout` in your source.

## Failures, retries, timeouts

- A command may set `retries` (default 3) and `timeoutMs` (default 600 000, ten minutes). A query may set `timeoutMs`.
- An attempt that runs past `timeoutMs` fails `TIMEOUT` and its signal is aborted.
- For async and scheduled jobs, a thrown error (`HANDLER_FAILED`), a timeout, a worker crash (`WORKER_CRASHED`), or an interruption (`INTERRUPTED`: kvman stopped or died during the attempt) is retried after an exponential backoff (1 s, 2 s, 4 s, …) until the retries run out; then the job ends `failed` with the last Problem. Every other Problem (one made with `ctx.problem(code)`, or a kernel Problem such as `VALIDATION_FAILED`) ends the job `failed` at once, with no retry.
- **Sync jobs are never retried**; the caller gets the Problem.
- Because an async job can run more than once, write handlers that are safe to repeat.
- A thrown error that isn't a Problem becomes `HANDLER_FAILED`; its message and stack go to the log, never to the caller.

```ts
handle: async (input) => {
  if (await alreadyDone(input)) return { id: input.id };       // safe to repeat
  if (!input.allowed) throw ctx.problem('notes/NOT_ALLOWED');  // never retried
  return doTheWork(input);
}
```

## Cancel

`ctx.cancel(jobId)` or `POST /api/jobs/:id/cancel` aborts the job's `ctx.job.signal`. A queued job ends `cancelled` at once; cancelling a finished job does nothing; an unknown id fails `NOT_FOUND`. A running job ends `cancelled`, with no retry, when its handler settles after the abort, or at its timeout if it ignores the signal. Pass `ctx.job.signal` to what you await (`fetch`, a child process). Jobs it started with `ctx.exec` share its signal; jobs started with `execAsync` don't.

## Progress

`ctx.job.progress(data)` sends a JSON chunk (at most 64 KiB) to the job's stream as `{ source: '<extension name>', data }`. Only async and scheduled jobs have a stream ([http-api.md](http-api.md)). Anything that must survive, such as an agent's messages, belongs in your store.

## Schedules

```ts
await ctx.schedule('notes.index.run', {}, { cron: '0 * * * *', key: 'hourly-index' });
await ctx.schedule('notes.reminder.send', { id }, { at: new Date(Date.now() + 3_600_000) });
```

- `{ at }` runs a command once; `{ cron }` repeats it.
- A `key` is unique per extension and workspace: scheduling again with the same key replaces the schedule and keeps its id. Schedule recurring maintenance from `kernel.started` with a key, so restarts don't pile up copies.
- When a schedule is due, the kernel queues an async job in the schedule's workspace, with the owner as its caller. A run that fell due while kvman was stopped, or while its workspace was closed, runs once at the next start or reopening; missed repeats aren't replayed.

## Handler points

Register a handler for one of the kernel's fixed points:

```ts
ctx.registerHandler('kernel.job.failed', {
  description: 'Records failed jobs.',
  handle: async (info) => { /* info.jobId, info.name, info.problem … */ },
});
```

| Point | Occurs | Input |
|---|---|---|
| `kernel.job.failed` | any job ends `failed` | `{ jobId, rootId, name, caller, workspaceId, problem, attempts }` |
| `kernel.job.succeeded` | an async or scheduled job ends `succeeded` | `{ jobId, rootId, name, caller, workspaceId }` |
| `kernel.job.cancelled` | any job ends `cancelled` | `{ jobId, rootId, name, caller, workspaceId, reason }` |
| `kernel.process.exited` | a long-lived process exits by itself | `{ extension, workspaceId, name, exitCode, signal }` |
| `kernel.workspace.opened` | a path becomes a workspace for the first time | `{ workspaceId }` |
| `kernel.started` | once per start, after every extension loads and before HTTP starts (and after a hot reload, for the reloaded extension and its dependents) | `{}` |
| `kernel.stopping` | at the start of shutdown | `{}` |

Handler inputs never include a job's input or output. Each occurrence queues one async job per handler in the same transaction that records the job's end, so a crash never loses or duplicates a handler call. A handler job, and every job it creates, never triggers handlers, so no chain can loop. `kernel.started` handlers get a 10 s budget; a failing one is logged and kvman still starts.

## Long-lived processes

```ts
await ctx.processes.start('watcher', { command: process.execPath, args: ['watch.js'], cwd: ctx.job.workspace.path });
```

`stop(name)` sends SIGTERM to the process group (then SIGKILL after 5 s) on Linux and macOS, and runs `taskkill /PID <pid> /T /F` on Windows. Output goes to `logs/processes/<extension>/<workspaceId>/<name>.log` (10 MB cap). A process that exits by itself triggers `kernel.process.exited`. On kvman's stop every process is stopped; after a crash, the next start kills the leftovers.

## Crashes

When a worker dies, each job it was running fails that attempt with `WORKER_CRASHED` and a new worker starts. When kvman itself is killed, no queued or running async job is lost: an interrupted attempt fails `INTERRUPTED` and the job runs again if it has retries left. A job that ended `succeeded`, `failed`, or `cancelled` never runs again.

## Next

- [storage.md](storage.md)
- [errors.md](errors.md)
- [testing.md](testing.md)
