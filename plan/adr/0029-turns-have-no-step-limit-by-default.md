# ADR 0029 — A turn has no step limit by default

The product owner ran `/build-kvman` and the turn ended with "The turn stopped after 50 steps" (2026-10-07): "while turns are unlimited". ADR 0005 set `kvcoder.maxSteps` to 50, and its schema took only a positive whole number, so the limit could be raised and never switched off. A turn that builds something reads, edits, and runs many things, and reaches 50 steps in ordinary work.

Decision 1 was asked with alternatives and mockups. Decisions 2 to 4 are the smallest way to carry it out; the product owner may overrule any of them.

## Decisions

1. **`kvcoder.maxSteps` defaults to no limit** (chosen over keeping 50 with a Continue button on the notice, over both, and over removing the setting). A turn runs until the agent finishes or the person presses Stop. A person can still set a number to cap it. This reverses the default of ADR 0005.
2. **The shape.** The setting is a positive whole number or `null`, and its default is `null`, which means no limit, as `null` means "none" for `kvcoder.model` and `kvcoder.shell.path`. `0`, a negative number, and a fraction still fail `VALIDATION_FAILED`. In the configuration form an empty field is `null`; the setting's description says so.
3. **With a number, nothing changes**: the step that reaches it still appends its results, then the turn ends `maxSteps` with the notice `MAX_STEPS` (ADR 0009, 102). The outcome and the notice stay.
4. **Every turn follows the setting**, a subagent's included, since they are the same turns. A home that set a number keeps it; one that never did has no limit from this version on.
