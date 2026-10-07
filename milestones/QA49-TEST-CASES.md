# QA 49 — A helper's title, a softer light theme, and output blocks that follow the theme (ADR 0037)

Asked: "give a subagent a title like 'ui expert, nodejs expert, etc..'" and "enhance the colors of light mode as they are not comfort for user eyes and looks ugly". The third ask of that message, a long output's first 12 and last 5 lines, is QA48-H17.

Every scenario is in `extensions/kvcoder/test/`.

## Happy path

- **QA49-H1 A run's title names its helper.** *Given* a background `delegate run` with the title `Node.js expert`, *then* its child session's title is `Node.js expert`, and `kvcoder.job.list` gives the run that title with the call's description as its `call`. `delegate-runs.test.ts`
- **QA49-H2 The subagent's card shows the title, the worker, and the task's first line.** *Given* a turn waiting on a helper started with the title `UI expert`, the worker `ui-ux`, and a task of two lines, *then* its card shows `UI expert`, the chip `ui-ux`, and the task's first line only. `web/conversation-stream.test.ts`
- **QA49-H3 A finished helper's card has its title.** *Given* a helper's result whose run is in the chat's job list with the title `Plan reviewer`, *then* the card reads `A helper finished: Plan reviewer`. `web/background-time.test.ts`
- **QA49-H4 The light theme is soft slate.** *Given* the chat page in the light theme, *then* the page's ground is `rgb(233, 237, 242)`, the conversation's surface `rgb(247, 248, 250)`, its text `rgb(36, 42, 49)`, and the New chat button `rgb(53, 80, 122)`; in the dark theme the ground is `rgb(21, 21, 19)`, as before. `e2e/light-theme.test.ts`
- **QA49-H5 A command and its output follow the theme.** *Given* an opened shell card, *then* in the light theme its two blocks are light with dark text, and in the dark theme dark with light text. `e2e/chat-scroll.test.ts` (QA9-H12, changed)

## Edge cases

- **QA49-E1 A run needs its title.** *Then* a `delegate run` with no `title`, and one whose title has 61 characters, fail `VALIDATION_FAILED` naming `title`, with the payload `{ worker, title, task, background? }`, and no child session is made. `delegate-runs.test.ts`
- **QA49-E2 A helper whose run isn't in the list keeps the call's words.** *Then* its card reads `A helper finished:` with the call's description. `web/background-time.test.ts`
- **QA49-E3 A card with no known task shows no task line.** *Then* a subagent's card whose call isn't among the messages shows its title and worker only. `web/conversation-stream.test.ts`
