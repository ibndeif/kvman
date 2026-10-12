---
"@kvman/kvcoder": minor
---

Keep the send box's text and attachments until the send is confirmed: a failed send keeps them and says what failed above the box, the box is disabled while a send is on its way, and the new-chat page reuses the chat it created. `kvcoder.message.send` takes an optional `sendId`; a repeat with the same `sendId` is acknowledged and adds nothing, and the new `send-receipts` records are deleted with their session.
