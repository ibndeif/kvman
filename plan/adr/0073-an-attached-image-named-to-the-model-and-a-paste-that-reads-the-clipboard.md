# ADR 0073 — an attached image named to the model, and a paste that reads the clipboard

Status: accepted by the product owner on 2026-10-13, before source. It amends ADR 0018 (4 and 6) and ADR 0009, 103.

## Context

The owner tried the desktop app and reported two things: "pasting attached image from clipboard doesn't work, also why the agent search for attachment in the workspace files while he knows it's exact location?"

- **The search.** The owner attached a screenshot and wrote "look at the attached image". The image reached the model inside the message, as an image (ADR 0009, 103). It is not a file in the workspace, and the message's text said nothing about it. The chat already had `attachments/template.docx` from an earlier message, so the model listed `attachments/` to find the image, and found nothing. Only files that aren't images are named in the text (ADR 0018, 4).
- **The paste.** The send box reads a paste's files (`clipboardData.files`). WebKitGTK, the engine of the desktop app's window on Linux, gives a paste of a copied image no files and no types. Checked on WebKitGTK 2.52.6 with a PNG alone on the clipboard and a Ctrl+V key press: the paste event has `types: []` and `files: 0`; a clipboard read (`navigator.clipboard.read()`) made while that paste is handled returns the `image/png`, with the engine's default settings; the same read with no key press or click behind it is refused with `NotAllowedError`.

## Decisions

1. **The model is told which images a message shows** (asked; chosen over also saving each image into `attachments/`, and over a line in the base prompt only). What is sent for a message with images ends its text with a blank line, the line `Attached images, shown in this message and not saved as files in the workspace:`, and one line `- <name>` per image, in the order given, before the image blocks.
2. **The note is added when the message is sent to the model, not stored.** The stored message, `kvcoder.message.list`, and the conversation the person reads are unchanged, and a message stored before this ADR gets the note too. It names only the images that are still there: one deleted since is not named and still reaches the model as `[image <name> was deleted]`; a message whose images are all deleted has no note.
3. **An empty paste reads the clipboard** (asked; chosen over leaving it and recording the limit, and over Tauri's clipboard plugin, which would make the page know the desktop app). When a paste has no files and no types, the send box reads the clipboard and attaches each item's image: its first of `image/png`, `image/jpeg`, `image/gif`, and `image/webp`, as a file named `image.png`, `image.jpeg`, `image.gif`, or `image.webp`. An item with none of these is left. A paste that has files, or any type, is handled as before, and the clipboard isn't read.
4. **A refused read says so.** When that read fails, a toast says "The clipboard couldn't be read. Use the attach button." (`kvcoder.ui.pasteFailed`), and nothing is attached.
5. **The desktop shell is unchanged.** The option the owner chose named an engine setting (`javascript-can-access-clipboard`) and `webkit2gtk` as a direct dependency. The check above showed that neither is needed: the engine allows the read while the person's paste is handled. No dependency is added, and no script gains a way to read the clipboard that it didn't have.

## Limits

- The check was a Ctrl+V key press. A paste chosen from the window's context menu was not checked.
- In an engine that asks before a clipboard read (Chrome), an empty paste may show the browser's own permission prompt. Such a paste carries nothing the browser exposes, so it is rare there: Chrome and Firefox give a pasted image as a file.

## Verification

Scenarios M2.4-E265 to E269, written before source. QA25-H3's "a paste without files is the browser's" is now a paste of text, and QA44-E2's text part ends with the note.
