# ADR 0068 — background runs the agent knows about, waits for, and cleans up

Status: accepted by the product owner on 2026-10-12, before source ("the agent should be aware of them and able to manage them"). It amends ADR 0011, 6 and the `background` table of plan 08 §8.5.

## Context

In one of the owner's chats the agent asked for a background run's output 82 times, a quarter of everything its calls returned: it had no way to wait for a run, so it polled. `background list` returned about 6.7 thousand characters a call, since each of its 50 rows held the run's whole line or task. And nothing told the agent what was still running when the person wrote again, or after a summary.

## Decisions

1. **`background wait { id, timeoutMs? }`** returns when the run ends or the time passes, with what `background output` returns; a run that is still running then has the status `running`. `timeoutMs` is 1 000 to 600 000, 120 000 by default. It is the command `kvcoder.background.wait`, a job that looks at the run every half second, as a line in the shell waits on its process (asked in the plan as unverified; it fits the kernel's jobs as they are, so no new mechanism). A cancelled turn ends it.
2. **`background list` returns short rows**: `[{ id, kind, title, status, startedAt, endedAt?, exitCode? }]`, where `title` is the run's title cut at 80 characters, in place of `call`. `output` and `wait` still return the whole `call`.
3. **`background output` takes `lines`** (1 to 500, 100 by default): how many of a process's last lines to return. It changes nothing for a subagent or a program worker's run.
4. **The agent is told what still runs.**
   - With the person's message: when the person sends a message while background runs of the chat are running, the message stores them as `content.running`, a list of `"<id> (<kind>): <title>"`, and it is sent to the model after the message's text as `[kvman: still running in the background: …. Use the background connector to wait for, read, or stop one.]`. It is stored with the message, so what is sent never changes.
   - In every summary (ADR 0066, 2), and a finished run still arrives as a message (ADR 0009, 89).
5. **The method says how to use them**: wait with `background wait` once in place of asking for the output again and again; stop what is no longer needed before the final answer, and name what still runs (ADR 0065, 7).

## Limits

`wait` holds its step for as long as it waits, as a line in the shell does. A message that is queued while a turn runs carries the runs of the moment it was sent.

## Verification

Scenarios M2.4-E238 to E242, written before source.
