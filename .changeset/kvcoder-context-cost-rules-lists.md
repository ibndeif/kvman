---
"@kvman/kvcoder": minor
---

The cost of summary and title calls is counted in the chat's totals, with a breakdown (`usageBy`) and the note that cost is an estimate. The context size is the provider's count only while the model, prompt and tools are the same, and an estimate otherwise (`estimated` on `kvcoder.context.get`). `AGENTS.md` and `CLAUDE.md` in the workspace folder are read as project rules. An answered question's result now says it was answered. A retried model call starts clean in the live view. The job list, the export and retention read every record instead of the first thousand.
