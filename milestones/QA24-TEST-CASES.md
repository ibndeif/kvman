# QA 24 — the conversation view after its first long chat (ADR 0017)

Reported: finished calls show "0.0 s"; outlined calls don't say why; the ⋯ menu doesn't close outside; the header and the artifact panel's header need a better arrangement; the token totals disagree; no slash commands; no pasting of files. Decided in ADR 0017; plan 07 §7.3, plan 08 §8.7. This file is the contract; every scenario's test name starts with its id.

## Happy path

- **QA24-H1 A finished call shows the whole wait.** *Given* an answer that took 36 000 ms with a call that ran 2 ms, *then* the call's card shows "36 s", and opened, "Written in 36 s · ran in 2 ms". `extensions/kvcoder/test/web/call-time.test.ts`
- **QA24-H2 Times use the unit that fits.** *Then* 2 ms is "2 ms", 1 240 ms "1.2 s", 36 002 ms "36 s", 69 319 ms "1 min 9 s", and 120 000 ms "2 min 0 s". `extensions/kvcoder/test/web/call-time.test.ts`
- **QA24-H3 A failed call says so.** *Then* a failed call's card has the chip "Failed" and the danger border, and a call that worked has neither. `extensions/kvcoder/test/web/call-time.test.ts`
- **QA24-H4 The menu closes outside.** *Given* the ⋯ menu open, *when* the person presses outside it, *then* it closes; Escape closes it too, and both close the delete confirmation. `extensions/kvcoder/test/web/header-menu.test.ts`
- **QA24-H5 The header and the send box.** *Then* a chat's header has the title, the totals, the artifacts button, and the menu, and no model picker, thinking select, or tabs; the send box has the model picker and the thinking select after the attach button, and picking a model runs `kvcoder.session.configure`. `extensions/kvcoder/test/web/header-menu.test.ts`
- **QA24-H6 The prompt is a menu item.** *When* the person picks "Show the prompt", *then* the prompt shows with "Back to the chat"; the menu then offers "Show the chat"; either brings the chat back. `extensions/kvcoder/test/web/header-menu.test.ts`
- **QA24-H7 The artifact panel's header.** *Given* a URL artifact at version 2, *then* the header shows the title, "URL · Version 2" under it, the Preview and Source switch, and three icon buttons labelled "Open in a new tab", "Copy", and "Close", each with that title. `extensions/kvcoder/test/web/artifact-panel.test.ts`
- **QA24-H8 The workspace total says what it counts.** *Then* `kvai.ui.status.usage` reads "Workspace total, with cached: {tokens} tokens · {cost}" in `en`, and has an `ar` text with the same params. `extensions/kvai/test/locales.test.ts`
- **QA24-H9 A slash command runs.** *Given* a chat, *when* the person types `/co`, *then* the list shows `/compact` with its description; Enter runs `kvcoder.session.compact`, sends no message, and empties the box. `extensions/kvcoder/test/web/slash-commands.test.ts`
- **QA24-H10 Every command does its action.** *Then* `/export` runs `kvcoder.session.export`, `/fork` runs `kvcoder.session.fork` and opens the copy, `/new` opens the Chat page, `/prompt` shows the prompt, and `/rename Shop` runs `kvcoder.session.rename { title: 'Shop' }`. `extensions/kvcoder/test/web/slash-commands.test.ts`
- **QA24-H11 A pasted image is attached.** *When* the person pastes a PNG file, *then* it is uploaded to `/api/files`, shown as an attachment, and sent as a `fileId`; no text is pasted. `extensions/kvcoder/test/web/paste-files.test.ts`
- **QA24-H12 In the real app.** *Given* kvman in Chromium with a chat that wrote a file and has an artifact, *then* the call's card shows a time that isn't "0.0 s"; the ⋯ menu closes on a click on the messages; the model picker in the send box opens above it, inside the page; `/prompt` shows the prompt; and the artifact panel's header is one row at 1280 px. `extensions/kvcoder/test/e2e/conversation-review.test.ts`

## Edge cases

- **QA24-E1 A call whose answer has no time shows its run alone.** *Given* an answer without `durationMs`, *then* the card shows the run's time, and opened, only "Ran in 2 ms". `extensions/kvcoder/test/web/call-time.test.ts`
- **QA24-E2 Several calls of one step.** *Given* an answer of 5 000 ms with calls that ran 1 000 and 3 000 ms, *then* their cards show "6.0 s" and "8.0 s". `extensions/kvcoder/test/web/call-time.test.ts`
- **QA24-E3 The list filters, moves, and completes.** *Then* `/` lists the six commands in name order; `/e` lists `/export`; Down and Up move the highlight and wrap; Tab makes the text `/export `. `extensions/kvcoder/test/web/slash-commands.test.ts`
- **QA24-E4 An unknown command isn't sent.** *When* the person types `/nope` and presses Enter, *then* the list says "No such command", nothing is sent, and the text stays. `extensions/kvcoder/test/web/slash-commands.test.ts`
- **QA24-E5 `/rename` needs a title.** *Then* `/rename` and Enter run nothing, and its row shows `/rename <title>`. `extensions/kvcoder/test/web/slash-commands.test.ts`
- **QA24-E6 Escape hides the list until the text changes**, and a text of two lines or one that doesn't start with `/` is a message. `extensions/kvcoder/test/web/slash-commands.test.ts`
- **QA24-E7 The Chat page sends a slash text.** *Given* no chat, *then* `/compact` shows no list and Enter sends it as the first message. `extensions/kvcoder/test/web/slash-commands.test.ts`
- **QA24-E8 A command that fails says so.** *Given* `kvcoder.session.compact` fails `kvcoder/SESSION_BUSY`, *then* the Problem is toasted. `extensions/kvcoder/test/web/slash-commands.test.ts`
- **QA24-E9 A pasted file that isn't an image isn't attached.** *When* the person pastes `notes.pdf`, *then* nothing is uploaded and a toast says "Only images can be attached: notes.pdf"; a paste of text only pastes the text. `extensions/kvcoder/test/web/paste-files.test.ts`
- **QA24-E10 The Chat page has the pickers in its send box and no header.** `extensions/kvcoder/test/web/chat-start.test.ts`
