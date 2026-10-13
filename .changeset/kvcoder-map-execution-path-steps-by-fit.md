---
'@kvman/kvcoder': minor
---

A node of the execution map is a step again in every word (the rename to "task" is undone), and the reminder says "unfinished steps". The lead's Plan presents the map as its execution path: the steps it found to be the best, most practical, and fastest way to deliver the request with the connectors and workers it has. A step is one stage of the path (what gets done, who does it, how it is checked) and may cover the few files that change together. Who does a step is chosen by fit and named in `uses`: the lead with a connector, or a worker whose description fits when the step needs that skill. Delegate allows a specialist, and Execute hands a step that names a worker to it with `delegate run`. A branch means delegation: steps side by side run at the same time, each done by a worker and started together in one reply, and the lead's own steps are one line (ADR 0075).
