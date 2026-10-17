# ADR 0085 — background runs the person sees, and a kvman that survives a busy database

Status: accepted by the product owner on 2026-10-17, before source. It amends ADR 0009, 26 and 150; ADR 0021; ADR 0068, 1;
ADR 0072 and 0074 (confirming the map); plan 02 §2.2 and §2.9; and plan 08 §8.2, §8.5, and §8.7.

## Context

The product owner reviewed the chat "Manually Testing the Research App" (research workspace, 15 to 17 October 2026, 1 960
messages, 33 helpers) and reported four problems: background jobs that ran for hours with nobody acting on them, the crash
`SqliteError: database is locked` from `queueDue`, kvman ending when the computer sleeps, and other trouble in the chat.

What the chat and the home database showed:

- Three background helpers stalled for 1, 1, and 6 hours on a `shell exec` with `risky: true`. Plan 08 §8.5 says a
  child's approvals show in the root conversation, but the conversation loaded only the children its own waiting turn
  points to, so a background helper's approval was shown nowhere. `background wait` and `output` said `running`, with no
  progress, and the lead told the person "neither worker currently provides progress or a reason for the delay".
- A message the person sent while the lead was inside a ten-minute `background wait` waited until the wait ended.
- Four helpers came back "Blocked" and one ended interrupted by a restart; the lead could only start a new helper, which
  read everything again.
- A process the lead stopped itself was reported "killed by a signal" twelve hours later, and every restart sent one
  notice per old process.
- The dispatcher's tick queues due schedules in a deferred transaction that reads, then writes. Under WAL a transaction
  that has read and then writes gets `SQLITE_BUSY` at once, without the busy timeout, when another connection writes; the
  throw left a timer, and kvman exited. The crashes came at 18:00, 20:00, and 21:00, when the hourly
  `kvwebui.effect.clean` schedule fires, and 20 to 40 seconds after each resume from suspend (16 Oct 20:08, 17 Oct 01:08,
  17 Oct 09:09), when that schedule is overdue while every worker writes. kvman logged nothing of it.
- The research app held 39 304 of the account's 65 536 inotify watches: on Linux, Node's recursive `fs.watch` watches
  every file and folder, `node_modules` included, and the kernel ignored those only after the event. Tests that create
  `.research-extraction-test-*` folders inside the extension folder, and `git` writing `.git`, reloaded it again and again.
- The lead asked the person 27 times, about 12 of them only "Start this plan?", once right after the person had chosen.
- The lead gave implementation work to the read-only `architect`, whose entry doesn't say it is read-only.

## Decisions

1. **A background helper's decisions show in the chat** (chosen over refusing every approval in a background helper, and
   over refusing after a time). A background subagent of the chat whose turn waits on the person shows in the chat's
   conversation, below the messages, as its helper card (its title, its task's first line, and its question and approval
   cards), under the line "A background helper needs your decision." (`kvcoder.ui.backgroundDecision`), whether the lead
   is running, waiting, or idle. The conversation learns of them from `kvcoder.job.list`. Deciding there resumes the
   helper as for a foreground one.
2. **A run that waits on the person says so, and a helper says how far it got** (chosen over one line of prose). A
   background row has the new status `waiting`: a subagent whose turn waits on the person's answer or approval. A
   subagent's row in `background output` and `wait`, and in `kvcoder.job.get`, adds
   `progress: { steps, lastActivityAt, recentCalls }` (its current or last turn's steps, the time of its newest message,
   and the descriptions of its last five calls, oldest first) and, while waiting, `waitingFor`, the descriptions of the
   calls it waits on. `background wait` ends as soon as the run's status is not `running`. The Running chip counts
   `running` and `waiting` runs, and a waiting run shows "Waiting for you" (`kvcoder.ui.jobs.waiting`).
3. **The person's message ends a wait.** A `background wait` that is running when a message from the person is queued for
   the chat ends at once with what `output` gives and `note: "The person sent a message."`, so the step ends and the
   message is read.
4. **`delegate continue` resumes a helper** (chosen over continuing background helpers only). The new command
   `delegate continue { id, message, background?: true }` sends `message` to an ended subagent helper of this chat, which
   continues with its own history, worker, instructions, model, and thinking; the person's grants are checked again as for
   `run`. It waits for the answer like `run`, or returns `started <id>` with `background`. It fails `VALIDATION_FAILED`
   while the helper's turn has not ended, and for a program worker's run; an id that is not a helper of this chat fails
   `kvcoder/JOB_NOT_FOUND`. Every helper result (a foreground answer, a background notice, and `background output`) ends
   with the line `(helper <id>)`, so the lead always has the id.
5. **Quieter end notices** (chosen by the owner). A process, a program worker's run, or a subagent that the lead stopped
   sends no later notice: the `stop` result already says so. The runs that ended while kvman was stopped are reported at
   the chat's next message as one message, one line per run with its outcome and no output (chosen over adding five lines
   of output each): `While kvman was stopped, these background calls ended:` then ``- `<call>` (job <id>): <outcome>``.
6. **A busy database is waited for, never fatal, and a crash leaves a record** (chosen over a crash log alone, and over
   the first point alone).
   - Every main-thread kernel transaction that writes begins `IMMEDIATE`, as a worker's store does, so it waits out the
     busy timeout (5 s) instead of failing at once.
   - When the dispatcher's tick, or the recording of a job's end, still fails with `SQLITE_BUSY` or one of its extended
     codes, the error is logged with its code ("The job loop couldn't write to the database; it tries again in 1 s.") and
     tried again after 1 s, an end with the outcome it had. Any other error is not caught.
   - An uncaught exception or an unhandled rejection in a kvman run is written to `logs/kvman.log` as an error ("kvman
     stopped on an unexpected error.", with the error's code when it has one and its stack, and never a payload); then
     the lock is released and kvman exits with 1.
7. **The person confirms a map only when what they get changes** (chosen over confirming only the first map, and over
   keeping every confirmation). The lead asks with `ask choice` for the first map of a request, and again only when a
   change alters the goal, what done looks like, what stays untouched, stored data, or what could go wrong. A change
   inside the plan (who does a step, the order, a step split or retried, a worker reassigned) is set and told in one line.
   It never asks to confirm a choice the person has just made.
8. **The extension watcher watches folders on Linux** (chosen over watching only what kvman loads). On Linux, the kernel
   walks a `path:` extension's folder and watches it and each folder below it, skipping `node_modules`, `.git`, and every
   folder whose name starts with `.`; a folder that appears is watched, and one that goes away is dropped. On macOS and
   Windows the native recursive watch stays (one handle; a per-folder watch on Windows can block deleting the folder), and
   its events from those folders are ignored. Batching (200 ms) and one reload at a time are unchanged.
9. **Read-only workers say so.** The delegate connector's entry ends a worker with `readOnly: true` with `; read-only`:
   `architect (Designs the structure of a change, …; read-only)`.

## Consequences

- The `kvcoder.prompt` benchmark baseline moves with decisions 4, 7, and 9.
- The research extension's own tests still make folders inside the extension; with decision 8 those are dot-folders and
  no longer reload it.

## Verification

Scenarios QA53-H1 to QA53-H14 and QA53-E1 to QA53-E14, written before source.
