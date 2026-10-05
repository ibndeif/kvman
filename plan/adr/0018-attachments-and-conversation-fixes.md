# ADR 0018 — Any file as an attachment, and what the conversation review left

After ADR 0017 the product owner asked (2026-10-05) to fix everything it listed as open: a paste took images only; a slash text on the Chat page was sent to the model; the artifact panel's header wrapped on a narrow panel; the panel, when it lies over the chat, covered the header's menu; and the header's time read "0 s" during a chat's first turn. Decisions 1 and 5 were asked with alternatives. The others are the smallest way to carry them out; the product owner may overrule any of them.

## Decisions

1. **A file that isn't an image is saved into the workspace** (asked; chosen over adding a text file's content to the message, and over images only). It is copied into the workspace folder under `attachments/`, and its path is added to the message, so the agent opens it with its file commands.
2. **`kvcoder.message.send` and `kvcoder.message.inject` do it**, with no new command: of their `fileIds`, the PNG, JPEG, GIF, and WebP images go to the model as before (and still fail `VALIDATION_FAILED` for a model that takes no images), and every other file is saved. This replaces "any other file fails `VALIDATION_FAILED`". The stored message's `fileIds` are the images only.
3. **Saving.** The file's name is its base name, with every character other than letters, digits, space, `.`, `_`, `-`, `(`, and `)` replaced by `_` (an empty name is `file`). A name that exists gets `-2`, `-3`, … before its extension; nothing is overwritten. `attachments` is resolved like an `fs` path: one that leaves the workspace folder through a symlink fails `VALIDATION_FAILED`, and nothing is saved or sent. After the copy, a user upload is unlinked from the kernel's files; an extension's file is left to its owner.
4. **The message's text** ends with a blank line, `Attached files:`, and one line `- attachments/<name>` per saved file, in the order given. A chat's automatic title is still the person's own text.
5. **A slash text on the Chat page shows the list, greyed, and sends nothing** (asked; chosen over sending it as a message). The list has the line "Send a first message to use commands"; no row can be picked, and Enter does nothing.
6. **The send box takes any file**, from the attach button or a paste; the button reads "Attach files". ADR 0017, 13's toast "Only images can be attached" is gone.
7. **The artifact panel's header stays one row.** Below 30 rem of panel width, Preview and Source are icon buttons with their names as label and tooltip, and the title is cut with an ellipsis.
8. **The chat's header spans the conversation and the artifact panel**, above both, so the panel never covers it, lying beside the chat or over it.
9. **The header's time counts the running turn**: the session's `durationMs` plus the time since the running turn's `startedAt`, by the page's clock, while the session is `running`.

## Consequences

- Plan 08 §8.1 and §8.7 are corrected. ADR 0009, 103 and ADR 0017, 4, 11, and 13 are changed by this ADR. The catalog key `kvcoder.ui.imagesOnly` is removed.
