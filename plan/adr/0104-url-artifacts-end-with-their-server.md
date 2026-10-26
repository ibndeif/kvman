# ADR 0104 — url artifacts end with their server

Status: accepted by the product owner on 2026-10-26. It amends plan 08 §8.5 (`artifact` and `background`) and ADR
0085, 5.

## Context

The owner asked kvcoder to delete expired artifacts. Nothing in the plan expires an artifact: a chat's artifacts go
only with the chat (ADR 0009, 175) or the daily prune. The owner chose what "expired" means: a `url` artifact whose
address nothing serves any more, because the background process that served it ended. Such an artifact shows a broken
frame in the panel, and the agent may still believe its preview runs.

## Decisions

1. **What a process served.** When a chat's background process ends, its url artifacts are those of the chat at its
   root (a subagent's process too, ADR 0009, 176) whose port is the port of one of the localhost links in the
   process's last 100 lines of output, the links the person's job list shows (ADR 0009, 152). `localhost` and
   `127.0.0.1` are the same machine, so only the port is compared; an address without one has its scheme's (80 or
   443). A server that never printed its address served no artifact. The owner chose this over requesting every
   url artifact's address when a process ends, which would catch servers that print nothing but could delete a slow
   or restarting one's.
2. **They are deleted at every ending**, the owner's choice: an exit by itself, the agent's `background stop`, the
   person's Stop, and kvman stopping or dying. The last two are recorded by handlers that run in Home and can't reach
   the chat, so their artifacts are deleted at the chat's next message, with the report of ADR 0085, 5. Markdown and
   HTML artifacts are never deleted this way.
3. **Two stops delete nothing**, the owner's choices: the person's Restart (`kvcoder.job.restart`), since the same
   line serves the same address again and a restart tells the chat nothing; and an exit inside the startup second,
   since no artifact can have been written for that process yet, so one at its address belongs to an earlier server
   that may still run. Deleting a chat deletes all its artifacts anyway.
4. **The agent is told**, the owner's choice over deleting silently: the message that reports the ending gets the
   line ``Its artifact `<id>` was deleted, since nothing serves its address now.`` (``Its artifacts `<a>`, `<b>` were
   deleted, since nothing serves their address now.`` for several, in id order) after its outcome and before its
   output. In the report of the runs that ended while kvman was stopped, the line follows that run's line, after a
   space. The agent's `background stop` result, which no message follows, gets `deletedArtifacts`, the ids in
   order, when any were deleted: `{ "stopped": true, "deletedArtifacts": ["preview"] }`.
5. **The panel needs no change**: it already moves to the first artifact left when the one it shows is gone, and
   closes when none is left (plan 08 §8.7).
