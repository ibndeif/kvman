---
'@kvman/kvcoder': minor
---

`kvcoder.message.send` and `kvcoder.message.inject` take any file: an image still goes to the model, and every other file is copied into the workspace folder under `attachments/` and named at the end of the message's text, in place of failing `VALIDATION_FAILED`. The send box attaches and pastes any file; a slash text on the Chat page shows a greyed list and sends nothing; the chat's header is above the artifact panel and its time counts the running turn; the artifact panel's header stays one row (ADR 0018).
