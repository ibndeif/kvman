---
'@kvman/kvcoder': minor
---

A stopped chat can be recovered in one click: under a failed, lost, or interrupted turn the conversation offers "Retry" and "Choose another model", and a failure notice shows the provider's own message (not its JSON) with names kept in order in Arabic. More temporary failures are retried (HTTP 408, 409, 425, and one more try after 15 s). Picking a model makes it the default for new chats. The prompt makes a reply either a tool call or the final answer, so "I'll start building" no longer ends a turn. Shell cards lose the exit chip (a failed call has a danger border) and their lines share one edge, and the model popover can no longer scroll the page sideways.
