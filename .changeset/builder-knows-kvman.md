---
'@kvman/kvbuilder': minor
'@kvman/testkit': minor
'@kvman/kvcoder': patch
---

The `/build-kvman` guide never lets the agent edit kvman itself, keeps extensions to the public APIs, designs from a map of which extension serves which need, and uses a developer's own words. `kvman extensions-get` gives one extension's public commands, queries, and settings with their JSON Schemas. `createTestKernel` and `kvman-check` load a project's declared dependencies from its `node_modules`, `kvman-check` names the npm line for one that isn't installed, and the preview adds the bundled extensions a project depends on. The `sdk` and `conventions` guides are the complete reference (ADR 0080).
