---
'@kvman/kvcoder': patch
---

A turn in fewer steps (ADR 0097): both methods start with putting independent calls in one reply, and the new `fs read-files` reads up to 10 files in one call. `fs read` and `fs edit` read to the model as numbered lines (the call card is unchanged), a failed edit names where its text was found or nearly found, an old call's long text is cleared with its result, the map's rules live in the `execution-map` entry with its true limits, the retry hints no longer ask for one call per reply, and "Decide for me" no longer tells the lead to call `ask`.
