---
'@kvman/kvcoder': minor
---

The lead chooses its path for each task: it sizes the task up and uses only the parts the task needs, with no numbered steps and no cut-off by files or calls. The execution map is the detailed implementation plan: `execution-map set` takes a required `description` on every step (1 to 500 characters), `kvcoder.map.get` returns it, and a press on a step shows it first. The lead asks the person to agree to a new or changed map with `ask choice` before it starts a step, and the person can write what to change. `risky` is judged per call: an edit to a file inside the workspace folder that the task needs is not risky, whoever made the file (ADR 0072).
