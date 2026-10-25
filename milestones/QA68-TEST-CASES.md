# QA 68 — the council worker, and deliberating before a map (ADR 0103)

**Asked.** The owner asked for a shipped worker that runs their operations-room debate, in English, used only for
complex requests before the execution map, with the lead deciding for each request between the debate only, the
debate then a map, a map only, or neither. Their answers are ADR 0103.

Paths are relative to `extensions/kvcoder/`.

## Happy path

- **QA68-H1 six shipped workers.** *Then* the shipped workers are `general`, `ui-ux`, `architect`, `tester`,
  `reviewer`, and `council`, in that order, and `council` has the description of ADR 0103, 5.
  `test/unit/shipped-workers.test.ts`
- **QA68-H2 the council's instructions.** *Then* they hold the recorder, the five members with the Expert chosen for
  the problem and the silent Maestro, reading the project first, the three hard rules, the tight record, the
  Maestro's final answer that doesn't summarize, and the return under Result; they are under 16 KB.
  `test/unit/shipped-workers.test.ts`
- **QA68-H3 read-only, at high.** *Then* `council` is read-only and its `thinking` is `high`, and every other shipped
  worker's is `null`. `test/unit/shipped-workers.test.ts`
- **QA68-H4 the council's helper thinks at high.** *Given* the shipped workers and helpers' thinking `medium`, *when*
  the lead delegates to `council`, *then* the helper's level is `high`, and its prompt holds `## Worker: council` with
  its instructions and the read-only rule. `test/delegate-default-model.test.ts`
- **QA68-H5 the lead's index.** *Then* the `delegate` entry lists `council (A council that debates … before any
  execution map; read-only)` after `reviewer`. `test/prompt.test.ts`
- **QA68-H6 Deliberate.** *Then* the lead's method has the part `Deliberate` between `Tests the person chose` and
  `Plan`, with the four choices of ADR 0103, 6, and Size up names it; with "Decide for me" it is the same.
  `test/unit/prompt-method.test.ts`

## Edge cases

- **QA68-E1 the part names no worker.** *Then* the Deliberate part doesn't contain `council`, and the
  `execution-map` entry still names no worker. `test/unit/prompt-method.test.ts`
- **QA68-E2 never for small work.** *Then* Deliberate says never for a question, a bug fix, or a clear or small
  change, and once per request. `test/unit/prompt-method.test.ts`
- **QA68-E3 a worker has no Deliberate.** *Then* a worker's method and the general lead method hold no `Deliberate`.
  `test/unit/prompt-method.test.ts`
- **QA68-E4 a saved list keeps its entries.** *Given* a saved list without `council`, *when* the lead delegates to
  `council`, *then* the call fails `kvcoder/WORKER_NOT_FOUND` naming the saved ones. `test/delegate-workers.test.ts`
- **QA68-E5 the council turned off** is left out of the index's workers. `test/delegate-workers.test.ts`
