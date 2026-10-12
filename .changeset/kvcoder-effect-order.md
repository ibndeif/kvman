---
"@kvman/kvcoder": patch
---

Effects of one reply now run in the model's order: approved calls no longer run in the order they were answered, and an effect behind a pending approval waits for it instead of running at once. Calls that could change something run one after another; reads still run in parallel.
