# QA 53 — Background runs the person sees, and a kvman that survives a busy database (ADR 0085)

**Asked.** The product owner reported, from the chat "Manually Testing the Research App": background jobs that run for
hours with nobody acting on them, the crash `SqliteError: database is locked` from `queueDue`, kvman ending when the
computer sleeps, and other trouble while using kvcoder.

**The owner chose:**
- a background helper's approvals shown in the chat;
- the status `waiting` with `progress` and `waitingFor`;
- the person's message ends a `background wait`;
- `delegate continue`, with `(helper <id>)` under every helper result;
- no notice for a run the agent stopped, and one line per run after a restart;
- IMMEDIATE main-thread writes, a busy tick tried again after 1 s, and a crash written to the log;
- a map confirmed only when what the person gets changes;
- a folder watcher on Linux only;
- `; read-only` in the worker list.

## Happy path

### The kernel

- **QA53-H1 A schedule falls due while a worker writes.** *Given* a schedule due now, and a worker thread holding a
  write transaction (`BEGIN IMMEDIATE`) on the same database file for 300 ms, *when* the dispatcher ticks during it,
  *then* kvman keeps running, the schedule's job is queued once the other transaction commits, and the schedule's
  `next_run` moves on. (Without IMMEDIATE the tick's read-then-insert fails at once with `SQLITE_BUSY`; the test fails
  on the code before the fix.) `packages/kernel/test/jobs/busy-database.test.ts`
- **QA53-H2 A transaction that reads first waits too.** *Given* a worker thread holding a write transaction for 300 ms,
  *when* the main thread opens a new workspace folder (`workspaces.open`, which reads, then inserts) and accepts
  extension versions (`checkTrust`), *then* each succeeds after the other transaction commits, without `SQLITE_BUSY`.
  `packages/kernel/test/jobs/busy-database.test.ts`
- **QA53-H3 A tick that stays busy is tried again.** *Given* a dispatcher whose connection's transaction fails once with
  a better-sqlite3 error of code `SQLITE_BUSY` and then works, and a fake clock, *when* a due schedule makes it tick,
  *then* nothing is thrown, one error record "The job loop couldn't write to the database; it tries again in 1 s." with
  `code: 'SQLITE_BUSY'` is logged, and after the clock moves 1 000 ms the schedule's job is queued.
  `packages/kernel/test/jobs/busy-tick.test.ts`
- **QA53-H4 A job's end that stays busy is recorded later.** *Given* a job that succeeds while the transaction recording
  its end fails once with `SQLITE_BUSY_SNAPSHOT`, *when* the clock moves 1 000 ms, *then* the job is `succeeded` with its
  output, its `kernel.job.succeeded` handlers are queued once, and `waitForJob` resolves with it.
  `packages/kernel/test/jobs/busy-tick.test.ts`
- **QA53-H5 An unexpected error is written to the log.** *Given* a running kvman (CLI run) whose process gets an
  uncaught exception `Error('boom')` with `code: 'EXAMPLE'`, *then* `logs/kvman.log` has an error record "kvman stopped
  on an unexpected error." with `code: 'EXAMPLE'` and a `stack` that contains `boom`, the lock file is released, and the
  exit code is 1; an unhandled rejection does the same. `packages/cli/test/stop/fatal.test.ts`
- **QA53-H6 On Linux the watcher watches folders, not files.** *Given* platform `linux`, a fake `watch`, and an extension
  folder with `src/`, `src/parts/`, `locales/`, `node_modules/a/`, `.git/objects/`, and `.cache-test/`, *when* the
  watcher starts, *then* it watches exactly the extension folder, `src`, `src/parts`, and `locales`, each without
  `recursive`, and no file. `packages/kernel/test/reload/folder-watcher.test.ts`
- **QA53-H7 On Linux a new folder is watched and its change reloads.** *Given* the watcher of H6, *when* `src/new/` is
  created and then `src/new/a.ts` is written, *then* `src/new` is watched, and one reload of the extension follows after
  200 ms of quiet. `packages/kernel/test/reload/folder-watcher.test.ts`
- **QA53-H8 On macOS and Windows the native recursive watch stays.** *Given* platform `darwin`, then `win32`, *when* the
  watcher starts, *then* it makes one `watch` of the extension folder with `recursive: true`. A change to `src/a.ts`
  reloads; a change to `node_modules/x/i.js`, `.git/index`, or `.cache-test/f` doesn't.
  `packages/kernel/test/reload/folder-watcher.test.ts`

### kvcoder

- **QA53-H9 A background helper's approval shows in the chat.** *Given* a background helper whose turn waits on an
  approval of a `shell exec` with `risky: true`, and the lead's session idle, *when* the conversation loads, *then* it
  shows "A background helper needs your decision." and the helper's card with its title and the approval's Allow and
  Deny; *when* the person allows, *then* `kvcoder.question.answer` is run for the helper's question, with the helper's
  session and turn as the owner. `extensions/kvcoder/test/web/background-decision.test.ts`
- **QA53-H10 A waiting helper says so and how far it got.** *Given* a background helper whose first reply made three calls,
  two reads and a `shell exec` with `risky: true`, so it waits on an approval after 1 step, *when* the lead calls `background output` and `background wait`, *then* both give `status: 'waiting'`,
  `waitingFor: [<the call's description>]`, and `progress: { steps: 1, lastActivityAt: <its newest message's createdAt>,
  recentCalls: <the descriptions of its calls, oldest first, at most 5> }`; `wait` returns at once although its
  `timeoutMs` is 600 000; `kvcoder.job.get` gives the same fields; `background list` and `kvcoder.job.list` give the
  status `waiting`. `extensions/kvcoder/test/background-waiting.test.ts`
- **QA53-H11 The person's message ends a wait.** *Given* the lead inside `background wait { id, timeoutMs: 600000 }` on a
  process that keeps running, *when* the person sends a message, *then* the wait returns within 2 s with `status:
  'running'` and `note: 'The person sent a message.'`, and the next step's context has the person's message.
  `extensions/kvcoder/test/background-wait-message.test.ts`
- **QA53-H12 A helper is continued with its history.** *Given* a foreground helper that ended `done`, *then* its result
  ends with `\n\n(helper <id>)`; *when* the lead calls `delegate continue { id, message: 'Now add the test.' }`, *then*
  the helper's session gets the message as a `user` message after its earlier ones, its next model request carries its
  whole earlier history, the call's result is its new answer ending with `(helper <id>)`, and its worker, instructions,
  and model are unchanged; with `background: true` the result is `started <id>` and the answer arrives as a background
  message. `extensions/kvcoder/test/delegate-continue.test.ts`
- **QA53-H13 Quieter notices.** *Given* a background process, a background subagent, and a program worker's background
  run, *when* the lead stops each with `background stop`, *then* the chat gets no background message for any of them, then
  or at the person's next message; *given* two background processes interrupted by a kvman stop, *when* the person sends
  a message after the restart, *then* exactly one background message is added before it: `While kvman was stopped, these
  background calls ended:` and one line per run, ``- `<call>` (job <id>): interrupted because kvman stopped.``
  `extensions/kvcoder/test/background-notices.test.ts`
- **QA53-H14 The prompt confirms less and names read-only workers.** *Given* the shipped workers, *then* the lead's
  prompt lists `architect (…; read-only)` and `reviewer (…; read-only)`, and `general (…)` without it; the lead's
  method says to confirm the first map and a change of the goal, done, what stays, stored data, or risk, and to set and
  tell in one line a change of who does a step, the order, a split, a retry, or a reassigned worker.
  `extensions/kvcoder/test/prompt-roles.test.ts`

## Edge cases

- **QA53-E1 Another database error is not caught.** *Given* a tick whose transaction fails with `SQLITE_CORRUPT`, *then*
  the error is thrown out of the tick (nothing logs "tries again"). `packages/kernel/test/jobs/busy-tick.test.ts`
- **QA53-E2 A busy tick that keeps failing keeps trying.** *Given* a transaction that fails with `SQLITE_BUSY` three
  times, *then* three error records are logged 1 000 ms apart and the fourth try queues the job; no retry runs after the
  dispatcher is `stopped`. `packages/kernel/test/jobs/busy-tick.test.ts`
- **QA53-E3 The crash record carries no payload.** *Given* an uncaught error with a `problem` that holds `params`, *then*
  the record has only `msg`, `code`, and `stack` besides the level and time. `packages/cli/test/stop/fatal.test.ts`
- **QA53-E4 On Linux a removed folder is dropped.** *Given* the watcher of H6, *when* `src/parts/` is removed, *then* its
  watch is closed and a later folder of the same name is watched again. `packages/kernel/test/reload/folder-watcher.test.ts`
- **QA53-E5 On Linux skipped folders stay skipped.** *Given* the watcher of H6, *when* `node_modules/b/`, `.git/refs/`,
  or `.research-extraction-test-x/` is created with a file in it, *then* nothing is watched and nothing reloads.
  `packages/kernel/test/reload/folder-watcher.test.ts`
- **QA53-E6 Many folders stay within a few watches.** *Given* a real extension folder with 50 folders under
  `node_modules` holding 20 files each, on Linux, *then* the watcher holds one watch per non-skipped folder only.
  `packages/kernel/test/reload/folder-watcher.test.ts`
- **QA53-E7 A foreground helper's approval still shows under its call.** *Given* a foreground helper waiting on an
  approval, *then* its card shows once, under the lead's waiting call, and not again under "A background helper needs
  your decision." `extensions/kvcoder/test/web/background-decision.test.ts`
- **QA53-E8 A helper that only runs isn't shown.** *Given* a background helper whose status is `running`, *then* the
  conversation shows no background decision line or card for it; the Running chip counts it. A `waiting` one is counted
  and its row reads "Waiting for you". `extensions/kvcoder/test/web/background-decision.test.ts`
- **QA53-E9 A process has no progress.** *Given* a background process, *then* its `background output` has neither
  `progress` nor `waitingFor`; an ended subagent has `progress` and no `waitingFor`.
  `extensions/kvcoder/test/background-waiting.test.ts`
- **QA53-E10 Only the person's message ends a wait.** *Given* the lead inside `background wait`, *when* a background
  process of the same chat ends (a `job` message is queued), *then* the wait goes on until its run ends or its time
  passes. `extensions/kvcoder/test/background-wait-message.test.ts`
- **QA53-E11 `continue` refuses what it can't continue.** *Given* the lead's chat, *then* `delegate continue` fails:
  `VALIDATION_FAILED` for a helper whose turn hasn't ended; `VALIDATION_FAILED` for a program worker's run id;
  `kvcoder/JOB_NOT_FOUND` for an unknown id and for a helper of another chat; the payload `{ id }` without `message`
  fails `VALIDATION_FAILED`. Nothing is sent to any helper. `extensions/kvcoder/test/delegate-continue.test.ts`
- **QA53-E12 `continue` rechecks the grants.** *Given* an ended helper whose worker has since been turned off
  (`enabled: false`), *then* `delegate continue` fails `kvcoder/WORKER_NOT_FOUND` and the helper gets nothing.
  `extensions/kvcoder/test/delegate-continue.test.ts`
- **QA53-E13 A failed helper's result still ends with its id.** *Given* a helper that ends `cancelled`, *then* its result
  `subagent ended cancelled…` ends with `(helper <id>)`, and `delegate continue` on it works.
  `extensions/kvcoder/test/delegate-continue.test.ts`
- **QA53-E14 The person's stop still tells the chat.** *Given* a background process and a background subagent, *when*
  the person stops each from the Running chip (`kvcoder.job.cancel`), *then* each adds its background message as before.
  `extensions/kvcoder/test/background-notices.test.ts`
