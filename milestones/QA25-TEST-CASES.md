# QA 25 — any file as an attachment, and what the conversation review left (ADR 0018)

Asked: fix everything QA 24 listed as open. Decided in ADR 0018; plan 08 §8.1 and §8.7. This file is the contract; every scenario's test name starts with its id.

## Happy path

- **QA25-H1 A file that isn't an image is saved into the workspace.** *Given* a file `notes.md`, *when* it is sent with "Fix it", *then* `attachments/notes.md` in the workspace folder has its content, the stored message's text is "Fix it", a blank line, "Attached files:", and "- attachments/notes.md", it has no `fileIds`, and the model gets that text. `extensions/kvcoder/test/attachments.test.ts`
- **QA25-H2 Images and other files together.** *Given* an image and a PDF, *then* the image reaches the model as an image, the PDF is saved, and the message's `fileIds` hold the image only. `extensions/kvcoder/test/attachments.test.ts`
- **QA25-H3 The send box takes any file.** *When* the person pastes `notes.pdf`, *then* it is uploaded and shown as an attachment, and sent as a `fileId`; the attach button is labelled "Attach files" and its picker has no `accept`. `extensions/kvcoder/test/web/paste-files.test.ts`
- **QA25-H4 The header's time counts the running turn.** *Given* a session of 60 000 ms that is `running` a turn started 30 s ago, *then* the header's totals say "2 min", and one second later still count on; an idle session shows its own time. `extensions/kvcoder/test/web/header-menu.test.ts`
- **QA25-H5 In the real app.** *Given* kvman in Chromium with a chat that has an artifact, *then* at 1280 px and at 800 px the header's menu button is not covered by the panel and opens; the artifact header's title, switch, and buttons are on one row at both widths; on the Chat page `/co` shows the greyed list and Enter creates no chat; and a file uploaded as the person and sent is named in the message and gone from the kernel's files. `extensions/kvcoder/test/e2e/conversation-review.test.ts`

## Edge cases

- **QA25-E1 A name that exists isn't overwritten.** *Given* `attachments/notes.md` exists, *then* the next ones are saved as `notes-2.md` and `notes-3.md`, and the first is unchanged. `extensions/kvcoder/test/attachments.test.ts`
- **QA25-E2 A name is made safe.** *Then* `../../etc/pass wd?.txt` is saved as `attachments/pass wd_.txt`, and a name of only unsafe characters as `attachments/___` or `file` when empty. `extensions/kvcoder/test/attachments.test.ts`
- **QA25-E3 `attachments` can't lead outside.** *Given* `attachments` is a symlink to a folder outside the workspace, *then* the send fails `VALIDATION_FAILED`, nothing is written there, and no message is stored. `extensions/kvcoder/test/attachments.test.ts`
- **QA25-E4 An extension's file is left to its owner.** *Given* a file written by `@test/todo`, *then* it is saved into the workspace and still in the kernel's files. `extensions/kvcoder/test/attachments.test.ts`
- **QA25-E5 An image for a text-only model still fails**, and an unknown file id fails `NOT_FOUND`. `extensions/kvcoder/test/images.test.ts`
- **QA25-E6 A slash text on the Chat page sends nothing.** *Then* `/co` shows the list with "Send a first message to use commands" and its rows disabled; Enter, a click on a row, and the send button create no chat and keep the text. `extensions/kvcoder/test/web/slash-commands.test.ts`
