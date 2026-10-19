---
'@kvman/kvcoder': patch
---

A session's view says who it waits on (`waitingOn`: `person`, `helpers`, or `null`); the list shows "Needs you" only for the person, the "Waiting for you" count and the tab's title count chats waiting on the person, and a chat that starts needing the person while the page is hidden shows a system notification once the person turned them on (ADR 0091, 6 and 7).
