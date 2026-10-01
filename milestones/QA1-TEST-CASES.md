# QA 1 — the whole app in Playwright (ADR 0009, 130–137)

Found by driving a real `dev` kvman in Chromium. Each fix names the test that proves it.

## Happy path

- **QA1-H1 The chat page fills its window.** *Given* a chat with one answer, *when* the page is 1280×800, *then* the session list is left of the conversation, the conversation's bottom edge is the page's bottom edge, the page itself doesn't scroll, and the send box is inside the window. (`extensions/kvcoder/test/e2e/chat-layout.test.ts`)
- **QA1-H2 The waiting count follows the steps.** *Given* an open chat whose model calls a command that needs approval, *when* the step ends waiting, *then* the status bar reads "Waiting for you: 1" with no reload, and "0" after the person allows. (`extensions/kvcoder/test/e2e/chat-layout.test.ts`)
- **QA1-H3 Times use the UI language.** *Given* the UI language `ar`, *when* the session list and totals render, *then* the list's time ends with Arabic ص or م (not AM or PM) and the tokens read "ألف" (not K). (`extensions/kvcoder/test/web/formats.test.ts`)
- **QA1-H4 A failed call names its model.** *Given* a step whose model call fails, *when* the turn ends, *then* the notice reads "The call to fake/m1 failed." in the conversation. (`extensions/kvcoder/test/turn-limits.test.ts` stores `details`; `extensions/kvcoder/test/web/notices.test.ts` renders it)
- **QA1-H5 Narrow windows get an icon rail.** *Given* a 390×800 window, *when* any page opens, *then* the nav is 68 px wide, no page scrolls sideways, the toggle opens the full nav over the page, and picking a page closes it. (`extensions/kvwebui/test/e2e/narrow.test.ts`)
- **QA1-H6 A rejected setting says why.** *Given* the setting row of `kvcoder.sessions.keep`, *when* the person saves `-5`, *then* the row shows the issue's message under the field. (`extensions/kvwebui/test/web/setting-row.test.ts`)
- **QA1-H7 The model picker groups by provider.** *Given* two ready providers and one without a key, *when* the header renders, *then* the picker has one group per ready provider, in provider-title order, and none for the other. (`extensions/kvcoder/test/web/model-picker.test.ts`)

## Edge cases

- **QA1-E1 Below 30 rem the chat stacks.** *Given* a window 600 px wide, *when* a chat opens, *then* the conversation is below the session list and the page doesn't scroll sideways. (`extensions/kvcoder/test/e2e/chat-layout.test.ts`)
- **QA1-E2 The session's own model stays in the picker.** *Given* a session whose model's provider has no key, *when* the header renders, *then* that model is listed and selected. (`extensions/kvcoder/test/web/model-picker.test.ts`)
- **QA1-E3 A notice without details still reads.** *Given* a `STEP_FAILED` notice stored before this fix (params `{ code }` only), *when* it renders, *then* it shows the translated code and no error. (`extensions/kvcoder/test/web/notices.test.ts`)
- **QA1-E4 The session list's time stays on one line.** *Given* a long title, *when* the list renders at 272 px, *then* the time's box is one line high. (`extensions/kvcoder/test/e2e/chat-layout.test.ts`)
- **QA1-E5 A setting that is valid shows no issue.** *Given* the issue under QA1-H6, *when* the person saves `20`, *then* the message is gone. (`extensions/kvwebui/test/web/setting-row.test.ts`)

# QA 2 — what QA 1 left (ADR 0009, 138–139)

- **QA2-H1 Status items rerun on a status change.** *Given* an open chat, *when* a reload finds the session's status changed (for example idle to waiting), *then* `kvman.refresh()` runs once and the status bar updates, even when the step ended before the page attached its stream; a reload that finds the same status doesn't. `refresh()` reruns the page's queries and runs no command. (`extensions/kvcoder/test/web/status-refresh.test.ts`, `extensions/kvwebui/test/web/kvman.test.ts`, `extensions/kvcoder/test/e2e/chat-layout.test.ts`)
- **QA2-H2 A late stream gets the chunks so far.** *Given* a running job that sent chunks 1 to 3, *when* a client connects, *then* it gets 1, 2, 3 and then the live ones; a page that opens mid-answer shows the first words. (`packages/kernel/test/http/progress-replay.test.ts`, `extensions/kvcoder/test/e2e/chat-layout.test.ts`)
- **QA2-E1 A refused folder says why.** *Given* the open-folder dialog, *when* the kernel answers `VALIDATION_FAILED`, *then* the dialog shows the Problem's message under the field. (`extensions/kvwebui/test/web/workspaces.test.ts`)
- **QA2-E2 The replay is bounded.** *Given* more than 256 KiB of chunks, *then* the oldest are dropped first and the newest is always kept. (`packages/kernel/test/http/progress-replay.test.ts`)
- **QA2-E3 The buffer goes with the job.** *Given* a job that ended, or a sync job with no row, *then* its buffer is dropped and another job's stays. (`packages/kernel/test/http/progress-replay.test.ts`)

