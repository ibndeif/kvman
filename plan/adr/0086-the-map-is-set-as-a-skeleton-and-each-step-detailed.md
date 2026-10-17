# ADR 0086 — the map is set as a skeleton, and each step is detailed on its own

Status: accepted by the product owner on 2026-10-17, before source. It amends ADR 0064, 2; ADR 0072, 1 to 3 and 7;
ADR 0085, 7; and plan 08 §8.2, §8.5, and §8.7.

## Context

The owner asked how the lead writes the execution map: `execution-map set` takes the whole map at once, every step with
its description, and every change of the plan sends all of it again. The owner asked to "optimize it by writing it
entirely at once but without a description for each step, then edit each step with the full description (the
description here is the full details which can include md, diagrams (not svg), charts, ...)", and to rename the
description to details. A refused `set` (a cycle, an unknown `after`) also threw away every description it carried, and
`execution-map get` returned every step whole, so larger descriptions would fill the context.

## Decisions

1. **`execution-map set` writes the skeleton** (asked; chosen over details optional in `set`, and over a batch call
   that details several steps). It takes `{ goal, steps: [{ id, title, after?, uses?, check }] }`, with no details. A
   step whose id stays keeps its details, as it keeps its status, evidence, and note; any other starts with none.
2. **`execution-map detail { id, details }` writes one step's details**, registered as `kvcoder.map.step.details.set`.
   It replaces what the step had, and fails `NOT_FOUND` when the chat has no map and `VALIDATION_FAILED` with the map's
   ids for a step the map doesn't have. Several calls in one reply run one after another, so the lead details every step
   in the reply after `set`.
3. **A step's `description` is now `details`**, Markdown of 1 to 4,000 characters (asked; chosen over 8,000 and 2,000):
   what the step changes and how, naming the files or parts and the approach, with lists, tables, and fenced `mermaid`
   blocks for diagrams and charts (`pie`, `xychart-beta`, `gantt`). A diagram is Mermaid code, never SVG (ADR 0067, 7).
   No chart library is added (asked; chosen over a new dependency).
4. **The step's dialog shows the details as Markdown** through kvwebui's Markdown view, which draws Mermaid (ADR 0067),
   under the row "Details" (`kvcoder.ui.map.details`, "Details" and "التفاصيل", replacing `kvcoder.ui.map.description`).
   The dialog is wide enough for a diagram, which scrolls sideways when it is wider.
5. **A stored `description` is read as `details`** (asked; chosen over no migration), and written under the new name the
   next time the map is saved. A step stored before ADR 0072 has `details: null`.
6. **Progress names the steps without details** (asked). `set`, `detail`, `update`, and `note` return
   `{ goal, progress, doing, ready, waiting, failed, undetailed, notes }`, where `undetailed` holds `"<id>: <title>"` of
   each step with no details.
7. **`doing` needs details** (asked). `update` refuses `doing` for a step with no details, naming the steps that lack
   them; if one change is refused, none is made, as before.
8. **`get` stays light** (asked). `execution-map get {}` returns the progress with the steps without their details and
   `noted`; `execution-map get { id }` returns the progress with that one step whole. `kvcoder.map.get`, the person's
   view, returns every step with its `details`.
9. **The person confirms the detailed plan** (asked; chosen over confirming the skeleton). The `ask choice` of ADR 0072, 3
   and ADR 0085, 7 comes once every step of the map has details (`undetailed` is empty), not right after `set`.

## Not taken

`delegate run { step }`, which would have put the step's details at the start of a worker's brief, was offered and not
chosen: the lead still writes the brief.

## Limits

That the lead details every step before it asks for the confirmation is a rule of the prompt; kvman refuses only
`doing` for a step without details.

## Verification

Scenarios written before source, in M2.4's test cases.
