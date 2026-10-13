---
'@kvman/kvcoder': patch
---

A message's images are named in the text the model is sent, as shown in the message and not saved in the workspace, so the agent doesn't look for them in `attachments/`. A paste with no files and no types reads the clipboard and attaches its PNG, JPEG, GIF, or WebP image, which makes pasting a copied image work in the desktop app on Linux; a read that fails shows a toast (ADR 0073).
