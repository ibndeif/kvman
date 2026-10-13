# ADR 0072 — a path chosen per task, a map the person agrees to, a step's description, and `risky` judged per call

Status: accepted by the product owner on 2026-10-13, before source. It amends ADR 0064 (2, 4, 8, and 9), ADR 0065 (the lead's method and its decision 2), ADR 0070 (3 and 4), and ADR 0012, 18.

## Context

The owner read kvcoder's prompts and asked for four things.

- "The execution map is representing the implementation plan so optimize it and also make each step in it has a description when the user click on it it shown up." A step had a title of a few words, and a press showed only its check, what it comes after and uses, its evidence, and its note.
- "If agent decides to create an execution map based on the given request then it must confirm it with the user as the user can ask for edits." The map was confirmed with `ask confirm` only for a task the agent judged large, ambiguous, or risky, and a yes or no left no room for edits.
- "The agent must be smart to decide the risky flag (as currently it shows some normal edit commands on the project files as risky while it is not)." The prompt called only a new file, and a file the agent made in the chat, its own work (ADR 0070, 4), so every edit of a file the project already had asked the person.
- "The agent must be smart to analyze, clarify and decide the path based on the given task as the path is not fixed it must be dynamic based on the given task and its complexity." The lead's method was eight numbered steps, with one cut-off: a task that changes one file, or that about five calls finish, skipped the plan and delegate steps.

## Decisions

1. **A step has a `description`** (asked; chosen over an optional one, and over one of up to 1,000 characters). `execution-map set` takes `steps: [{ id, title, description, after?, uses?, check }]`: `description` is required, 1 to 500 characters, and says what the step changes and how, in words the person reads without the code. It is stored on the step, returned by `execution-map get` and `kvcoder.map.get`, and replaced by each `set`. A step stored before this ADR has `description: null`.
2. **A press on a step shows its description first.** The detail under the diagram gains the row "About" (`kvcoder.ui.map.description`), after the step's title and status and before what it comes after. A step with no description has no such row.
3. **The map is the implementation plan the person agrees to** (asked; chosen over `execution-map set` becoming a command that asks, whose Deny carries no text, and over an Approve bar on the map panel with a stored approval that kvman enforces). After an `execution-map set` that makes the map or changes its steps succeeded, and before any step is started, the lead calls `ask choice` with `other: true`: the first option starts the work and the second changes the plan, and the person may write what to change. On a change it sets the map again and asks again; it starts only after the person chose to start. A change of status with `execution-map update`, and a `note`, are not confirmed. It replaces the `ask confirm` of ADR 0064, 9 and ADR 0065, 2, which covered only a large, ambiguous, or risky task. It is a rule of the prompt: kvman stores no approval and refuses no step for the lack of one.
4. **`risky` is judged per call, from what the call does** (asked; chosen over still asking for a whole-file overwrite, and over still asking for a change the request did not call for). It replaces the "own work" rule of ADR 0070, 4 and ADR 0012, 18.
   - **false** for the ordinary work of the task: creating, editing, or rewriting a file inside the workspace folder that the task needs, whoever made it, since `fs undo` takes such a change back; running the project's own build, tests, and tools; a tool that only reads.
   - **true** only when the call could do what is hard to take back, or reaches past the task: anything outside the workspace folder; deleting files, or overwriting them with a shell line; a file that holds secrets, such as `.env` or a key; rewriting or discarding git history or uncommitted work (`push --force`, `reset --hard`, `clean`); `sudo`, or an install outside the project; sending something out (a push, a publish, a deploy, a message, a write to a remote service); and the Commands section of `AGENTS.md` (ADR 0069, 4).
   - When the agent can't tell whether a call can be taken back, it is true.
   - How kvman acts on the flag is unchanged (plan 08 §8.3): `true` asks, `false` runs at once, and `kvcoder.shell.approval: ask` asks for every such call.
5. **The lead chooses its path for each task** (asked; chosen over three named tiers). The eight numbered steps and the cut-off of one file or about five calls are removed. The method says:
   - **No path is fixed.** The lead chooses it from what the task is, and changes it when what it finds changes it.
   - **Size up the task first**: how clear it is, how much it changes, what could go wrong and how hard that is to take back, and whether the person will look at the result. From that it chooses the lightest path that delivers the task well: a question gets an answer and no change; a small, clear change is done and checked; an unclear request gets its questions first; work in several parts, or work that is hard to take back, gets a map the person agreed to; separate parts may get workers; a result the person looks at is shown.
   - **The parts of a path**, each named and described once, used only when the path has them: Understand, Clarify, Plan, Confirm the plan, Execute, Stay on the task, Delegate, Show what the person will look at, and Finish. Their rules are those of ADR 0065 and ADR 0070, except decisions 1, 3, and 4 above. Execute says what to do with a map and without one.
   - A worker's method is unchanged.
6. **The connector's entry says what the map is**: the implementation plan the person reads, agrees to, and watches as a diagram, whose steps each carry a description the person opens with a press.

7. **The map is detailed, not an outline** (the owner's own direction, sent while this was written: "the execution map is not a high level but detailed steps"). A step is one concrete change the lead can name before it starts: the file or the few files that change together, a test, or a command to run, never a phase such as "implement" or a whole feature. Its description names the files or parts and the approach, and its check is the exact command or the thing looked at. The limits of ADR 0064, 2 stay: 1 to 40 steps.

## Limits

The confirmation is the agent's own call, as every `ask` is: a model that skips it starts unconfirmed, and kvman doesn't stop it. `risky` remains the model's judgement; `kvcoder.shell.approval: ask` is the setting for a person who wants every call asked.

## Verification

Scenarios M2.4-E259 to E264, written before source. QA33-H2 to H5, QA19-H15, M2.4-E227, and M2.4-E256 are rewritten for the new method.
