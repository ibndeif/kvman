# QA 54 — The map is set as a skeleton, and each step is detailed on its own (ADR 0086)

**Asked.** The product owner asked to write the execution map at once without a description for each step, then to
write each step's full details (Markdown, diagrams that are not SVG, charts) on their own, and to rename the
description to details.

**The owner chose:** `set` takes the skeleton and `execution-map detail { id, details }` one step; details are Markdown
of up to 4,000 characters with Mermaid diagrams and charts; a stored `description` is read as `details`; `undetailed`
in every progress result; `doing` needs details; a light `get`; the person confirms the plan once every step has
details.

Paths are under `extensions/kvcoder/`.

## Happy path

- **QA54-H1 set takes the skeleton.** *Given* a chat, *when* the agent calls `execution-map set` with two steps that
  carry no details, *then* it succeeds, `kvcoder.map.get` gives both steps with `details: null`, and the result is
  `{ goal, progress: '0 of 2 done', doing: [], ready: [...], waiting: [...], failed: [], undetailed: ['read: Do read', 'build: Do build'], notes: 0 }`.
  The system prompt's index shows `set { goal, steps: [{ id, title, after?, uses?, check }] }`,
  `detail { id, details }`, and `get { id? }`. `test/map-details.test.ts`
- **QA54-H2 detail writes one step.** *Given* a map of two steps, *when* the agent calls `execution-map detail` for
  `read` with Markdown holding a list, a table, and a fenced `mermaid` block, *then* `kvcoder.map.get` gives that text
  whole as `read`'s `details`, the result's `undetailed` is `['build: Do build']`, and the map's `version` grew by one;
  a second `detail` of `read` replaces the text. `test/map-details.test.ts`
- **QA54-H3 a second set keeps the details of a kept step.** *Given* a map whose `read` and `old` steps have details,
  *when* the agent sets the map again with `read` and a new step `fresh`, *then* `read` keeps its details, `fresh` has
  `details: null`, `old` is gone, and `undetailed` is `['fresh: Do fresh']`. `test/map-details.test.ts`
- **QA54-H4 a detailed step starts.** *Given* a map whose `read` step has details, *when* the agent marks it `doing`,
  *then* the change is made. `test/map-details.test.ts`
- **QA54-H5 get is light, and one step is read whole.** *Given* a detailed map with a note, *when* the agent calls
  `execution-map get {}`, *then* the result has the progress, `noted`, and `steps` whose entries have no `details` key;
  *when* it calls `execution-map get { id: 'read' }`, *then* the result has the progress, `noted`, and `step`, `read`
  with its `details`, and no `steps`. `test/map-details.test.ts`
- **QA54-H6 the person's view has every step's details.** *Given* a map with one detailed step and one without,
  *when* `kvcoder.map.get { sessionId }` runs, *then* the steps have `details` the text and `null`.
  `test/map-details.test.ts`
- **QA54-H7 a stored description is read as details.** *Given* a stored map document whose step has
  `description: 'Read it.'` and no `details`, *when* `mapDocSchema` parses it, *then* the step has
  `details: 'Read it.'` and no `description` key, so the next save writes `details`. `test/unit/map-rules.test.ts`
- **QA54-H8 the dialog shows the details as Markdown.** *Given* a map whose step `read` has details, *when* the person
  presses the step, *then* the dialog has the row `map-details` with the label "Details" ("التفاصيل" in Arabic), and
  its content is kvwebui's Markdown view (`type: 'markdown'`) of the details text. A step without details has no such
  row. `test/web/execution-map-view.test.ts`
- **QA54-H9 the call card names the step detailed.** *Given* a finished `execution-map detail { id: 'read', … }` call,
  *when* its card closes, *then* its line is "Step details · read · <progress>" ("تفاصيل خطوة" in Arabic).
  `test/web/call-summary.test.ts`
- **QA54-H10 the prompt teaches skeleton first.** *Given* the lead's working method, *then* its Plan part says to set
  the skeleton first and detail each step with `execution-map detail`, one call per step, all in the reply after the
  set, that a kept step keeps its details, and that details are Markdown with Mermaid diagrams or charts and never SVG;
  its Confirm part asks only once every step has details. The connector's description ends with limits that include
  details up to 4,000. `test/unit/prompt-method.test.ts`

## Edge cases

- **QA54-E1 detail with no map.** *Given* a chat with no map, *when* the agent calls `execution-map detail`, *then* it
  fails `NOT_FOUND`. `test/map-details.test.ts`
- **QA54-E2 detail of a step the map lacks.** *Given* a map of `read` and `build`, *when* the agent details `ghost`,
  *then* it fails `VALIDATION_FAILED` with "The map has no step ghost. Its steps are: read, build.", and the map's
  `version` is unchanged. `test/map-details.test.ts`
- **QA54-E3 details' limits.** *Given* a map, *when* the agent details a step with 4,001 characters, or with an empty
  text, *then* it fails `VALIDATION_FAILED`; with exactly 4,000 characters it succeeds. `test/map-details.test.ts`
- **QA54-E4 set refuses details and descriptions.** *Given* a chat, *when* the agent calls `set` with a step that has
  `details`, or one that has `description`, *then* it fails `VALIDATION_FAILED` and no map is made.
  `test/map-details.test.ts`
- **QA54-E5 doing needs details.** *Given* a map whose `read` has details and `page` has none, both ready, *when* the
  agent calls `update` with `read` `doing` then `page` `doing`, *then* it fails `VALIDATION_FAILED` with
  "page can't be doing yet: it has no details. Write them with execution-map detail first.", and `read` is still
  `todo`. `test/map-details.test.ts`
- **QA54-E6 the other statuses don't need details.** *Given* a map whose steps have no details, *when* the agent marks
  one `skipped` with a note and another `failed` with a note, *then* both changes are made.
  `test/map-details.test.ts`
- **QA54-E7 get of a step the map lacks.** *Given* a map, *when* the agent calls `get { id: 'ghost' }`, *then* it fails
  `VALIDATION_FAILED` naming the map's ids; with no map, `get { id: 'read' }` fails `NOT_FOUND`.
  `test/map-details.test.ts`
- **QA54-E8 a step from before ADR 0072.** *Given* a stored step with neither `description` nor `details`, *when* it is
  parsed, *then* its `details` is `null`. `test/unit/map-rules.test.ts`
- **QA54-E9 one reply's map calls run in order.** *Given* a chat, *when* one reply calls `set`, then `detail` for each
  of its two steps, *then* all three succeed, the last result's `undetailed` is empty, and the map's `version` is 3.
  `test/map-details.test.ts`
