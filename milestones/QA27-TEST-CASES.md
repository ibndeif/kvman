# QA 27 — the kept messages are a setting (ADR 0020, 1)

Asked: "refactor compact to leave last n messages, and add a config for it". Decided in ADR 0020, 1; plan 08 §8.1 and §8.7. This file is the contract; every scenario's test name starts with its id.

## Happy path

- **QA27-H1 A summary keeps `kvcoder.compactKeep` messages whole.** *Given* 14 messages (seq 0 to 13) and `kvcoder.compactKeep` 4, *when* a message is sent above `kvcoder.compactAt`, *then* the summary covers through seq 10, and the model gets the summary, the last 4 messages, and the new one. `extensions/kvcoder/test/compaction-keep.test.ts`
- **QA27-H2 A summary by hand keeps as many.** *Given* the same chat and `kvcoder.compactKeep` 6, *when* `kvcoder.session.compact` runs, *then* it answers `{ summarized: true }` and the summary covers through seq 7. `extensions/kvcoder/test/compaction-keep.test.ts`
- **QA27-H3 The default is 10.** *Given* no value set, *then* `kernel.settings.list` gives `kvcoder.compactKeep` as 10 with the global and workspace scopes, and a summary by hand of the same chat covers through seq 3, keeping the last 10. `extensions/kvcoder/test/compaction-keep.test.ts`
- **QA27-H4 A workspace's own value wins.** *Given* 4 globally and 8 in the workspace, *when* the workspace's chat is summarized by hand, *then* the summary covers through seq 5. `extensions/kvcoder/test/compaction-keep.test.ts`
- **QA27-H5 The Agent card shows the setting after `kvcoder.compactAt`.** *Then* `kvcoder.ui.get`'s Agent card is the model, `kvcoder.thinking`, `kvcoder.maxSteps`, `kvcoder.compactAt`, `kvcoder.compactKeep`. `extensions/kvcoder/test/ui.test.ts`
- **QA27-H6 The toast names the number in effect.** *Given* `kvcoder.compactKeep` 6 and `{ summarized: false }`, *then* the toast is `kvcoder.ui.nothingToSummarize` with `{ count: 6 }`, which reads "…the messages before the last 6 are still short". `extensions/kvcoder/test/web/command-progress.test.ts`

## Edge cases

- **QA27-E1 Out of range.** *When* `kvcoder.compactKeep` is set to 0, 101, or 2.5, *then* each fails `VALIDATION_FAILED` and the value stays 10. `extensions/kvcoder/test/compaction-keep.test.ts`
- **QA27-E2 Fewer messages than are kept.** *Given* 14 messages and `kvcoder.compactKeep` 20, *when* `kvcoder.session.compact` runs, *then* it answers `{ summarized: false }`, with no model call and no summary. `extensions/kvcoder/test/compaction-keep.test.ts`
- **QA27-E3 The minimum still holds.** *Given* 14 short messages and `kvcoder.compactKeep` 1, *when* `kvcoder.session.compact` runs, *then* it answers `{ summarized: false }`: thirteen short messages are under 10% of the window (ADR 0019, 7). `extensions/kvcoder/test/compaction-keep.test.ts`
