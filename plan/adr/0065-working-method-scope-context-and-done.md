# ADR 0065 — the lead's working method: staying on the task, spending context with care, showing UI, and what done means

Status: accepted by the product owner on 2026-10-12, before source. It amends ADR 0022, 4 (the lead's steps) and ADR 0012, 11.

## Context

Measured in three of the owner's chats: a step's prompt averaged 100 to 120 thousand tokens, and the model's own writing was about 70% of a chat's time, so cost and time are the number of steps times the size of the context. One chat read 35 files 95 times and asked for a background run's output 82 times; helpers were 24 to 46% of a chat's cost and read again 80 to 100% of what the lead had read. The owner's own complaints were work that wandered to a problem found on the way, a first screen that wasn't right to left, a broken field delivered as done, extras nobody asked for, and questions about harmless choices. The method said nothing about scope or context, and planned in a `plan` artifact (ADR 0064 replaces it).

## Decisions

1. **Eight steps** in place of six: Understand, Clarify, Plan, Execute, Stay on the task, Delegate, Show what the person will look at, Finish. A task that changes one file, or that about five calls finish, skips the map and the worker; every other task starts with its map.
2. **Plan on the execution map** (ADR 0064), before anything is changed; the shortest path that delivers what was asked, ending with the project's own checks; set in the same reply as the first call, and confirmed with `ask confirm` when the task is large, ambiguous, or risky.
3. **Execute by the map**: the ready steps, the independent ones together; `doing` at the start, `done` with evidence. "A step is not done because you wrote it."
4. **Stay on the task.** A problem the task doesn't need is not looked into: it is recorded with `execution-map note`, or kept for the final answer when there is no map.
5. **Delegate less.** Only separate work that runs beside the lead's, or one fresh review of a finished change; never what a few of its own calls would do.
6. **Show UI in an artifact** (asked for by the owner on 12 October). When the task includes a screen, a page, a layout, or a style: the design as an HTML page before it is built when the layout is a real choice, and the running app as a `url` artifact once it runs; built in the language and direction of its content, and checked as far as the connectors allow.
7. **Finish** also stops background work it no longer needs, and the final answer says what was done, what was checked and what it showed, what is unchecked, what still runs, and what was noted for later.
8. **Clarify** adds: an ordinary detail that is easy to change is decided, and said, not asked.
9. **A new rule for both roles, "spend context with care"**: every result is read again at every step; search before reading, read the part needed, never read again a file already held (an edit's result shows the new lines), and don't ask again and again for a background run's output.
10. **"Don't add what wasn't asked"** names what that means: no extra feature, file, option, or document.

11. **Tightened after the first live trial** (12 October, GPT-6 Luna on a four-file task): the model made no map, called `help` for listed commands, and wrote one file a reply. The size that needs no map is now a number, "one file, or about five calls", the Plan step says "before you change anything", and the rule on one reply's calls names several `fs write` calls for several new files.

## Limits

These are instructions; kvman enforces only what ADR 0063 and ADR 0064 enforce. The prompt is longer by about 450 tokens for the lead, so the `kvcoder.prompt` benchmark's baseline moves.

## Verification

Scenarios M2.4-E227 and E228, written before source.
