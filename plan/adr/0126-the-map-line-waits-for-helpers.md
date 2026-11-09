# ADR 0126 — The "steps not done" line waits for the chat's helpers

Status: accepted, 2026-11-09. Asked of the product owner after the line showed in a chat that was still working; the
recommended option was chosen. It amends plan 08 §8.7 and ADR 0092, 1.

## Context

Plan 08 §8.7 showed "N steps of the execution map are not done." with **Continue** whenever the chat was idle and
steps were left. Since ADR 0108 every helper runs in the background: the lead starts it, writes a line, and ends its
turn, so the chat is idle while the helper works, and the helper's result starts the next turn. In the owner's chat of
2026-11-09 ("Research App Analysis Capabilities"), the line and its Continue showed in every such gap. A press there
starts a second turn beside the helper still working on the same step.

## Decision

1. **The line waits for helpers** (asked; recommended over hiding it for any background job, and over a separate
   "helpers are working" line). The line, with Show the map and Continue, shows only when the chat is idle, steps are
   left, and none of the chat's background subagents or program workers is running or waiting (the Running chip's
   list, `kvcoder.job.list`, with `kind` `subagent` or `worker`).
2. **Background processes don't count.** A dev server or a watcher can run for hours; it doesn't hide the line.
3. **Unchanged:** kvman starts nothing itself (ADR 0064, 11); the header's map button and the Running chip.
