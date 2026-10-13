# ADR 0064 — the execution map: the one way the agent plans, and how the person sees progress

Status: accepted by the product owner on 2026-10-12, before source. It replaces the `plan` artifact of ADR 0022, 4 and amends ADR 0036, 2 (decision 12).

## Context

The agent planned in a Markdown artifact named `plan`, a checklist it rewrote with `artifact edit`: 28, 20, and 68 versions in three of the owner's chats, read back with `artifact get` after every summary. It showed no order, no parallel work, and no proof that a ticked step was checked. The owner asked for one way to plan: a flow the person can see, with what is done, what is left, and what runs in parallel, which the agent also uses to keep to its task.

## Decisions

1. **A built-in connector, `execution-map`** (asked: named by the owner). It is the lead's alone: a child session never has it. A chat has one map, kept in the collection `maps` under the chat's own id, and deleting the chat deletes it.
2. **A map is a goal and steps.** A step has `id` (lowercase kebab, up to 50 characters, unique in the map), `title` (up to 100), `after` (the ids of the steps that must be finished first; none by default), `uses` (the connector or worker it uses, optional: one name up to 60 characters, or a list of up to 5, kept as one text joined with commas; the list was added after the first live trial, where the model wrote one and lost a call), and `check` (how it will be verified, up to 300). A map has 1 to 40 steps, and its goal is up to 300 characters.
   - **Parallel work is not declared**: two steps with no path between them through `after` can run together.
   - A map whose `after` names an unknown step or the step itself, or whose steps wait on each other in a circle, fails `VALIDATION_FAILED`, naming the steps.
3. **A step's status** is `todo`, `doing`, `done`, `failed`, or `skipped`. A step is *finished* when it is `done` or `skipped`, and *ready* when it is `todo` and every step in its `after` is finished.
4. **The commands.**

   | Command | Payload | What it does |
   |---|---|---|
   | `set` | `{ goal, steps: [{ id, title, after?, uses?, check }] }` | Makes the map, or replaces it: a step whose id is in both keeps its status, evidence, and note; any other starts `todo`. Notes are kept. |
   | `update` | `{ steps: [{ id, status, evidence?, note? }] }` | Changes the status of one or more steps, in the order given; if one change is refused, nothing changes. |
   | `note` | `{ text }` | Adds a line to "Noted for later" (up to 500 characters; a map holds 50). |
   | `get` | `{}` | The whole map. |

   `update`, `note`, and `get` fail `NOT_FOUND` when the chat has no map.
5. **The rules of `update`** (asked; all four chosen).
   - **Order.** `doing` and `done` need every step in `after` finished; the refusal names the ones that are not.
   - **Evidence.** `done` needs `evidence` (10 to 500 characters): what was run or checked and what it showed.
   - `failed` and `skipped` need `note` (up to 300): why. `todo` clears a step's evidence and note.
6. **What the agent reads back.** `set`, `update`, and `note` return `{ goal, progress, doing, ready, waiting, failed, notes }`: `progress` is `"{finished} of {total} done"`, and each list holds `"<id>: <title>"`. So the next steps are at the end of the context after every change. `get` adds `steps` whole and the notes' texts.
7. **Calls on a map take turns**: the map commands of one reply run one after another in the model's order, as the calls on one artifact do.
8. **The person's view.** `kvcoder.map.get { sessionId }` is a public query that returns the chat's map (`goal`, `steps`, `notes`, `version`, `updatedAt`) or `null` when it has none; a subagent's session answers with its chat's map. The diagram is ADR 0064's second part, in plan 08 §8.7.
9. **The old planning is removed.** The lead's method no longer writes a `plan` artifact or ticks it with `artifact edit`, and the `artifact` connector's description no longer names a plan. `ask confirm` before a large, ambiguous, or risky task confirms the map. A `plan` artifact a chat already has stays an ordinary artifact.
10. **Out-of-scope findings go to the list** (asked). A problem the agent notices that its task doesn't need is recorded with `note` and not investigated; the list is shown with the map and reported in the final answer.
11. **An ending with steps left says so** (asked; chosen over kvman continuing the turn itself). kvman never starts a turn because a map is unfinished.

12. **Its calls' closed lines** (ADR 0036, 2): `set` is "Plan", the goal, and the progress; `update` is "Map step", the ids it changed, and the progress; `note` is "Noted for later" and the text; `get` is "Read the map" and the progress. `background wait` is "Wait for", the id, and the run's status, and opens as `background output` does (ADR 0062, 2; ADR 0068).

## Limits

kvman checks a map's shape and order, not whether the plan is a good one, and `evidence` is the agent's own words. Checks that kvman runs itself were put off by the owner on 12 October, with a direction for when they come back: kvman should not run a check itself; a worker of `delegate` should verify the step. A session's export doesn't include its map (my own choice, to be confirmed: adding it changes the export's shape). The person can't edit the map in the UI yet; they ask the agent.

## Verification

Scenarios M2.4-E218 to E226, written before source.
