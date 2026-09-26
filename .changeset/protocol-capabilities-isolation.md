---
"@kvman/protocol": minor
---

Add the capability and isolation shapes (M2.4): the `store.read` host call with its reads and answers (`storeReadSchema`, `versionedValueSchema`, `kvRowSchema`, `storedDocumentSchema`, `storedLogEntrySchema`, `readCountSchema`, `documentIdsSchema`, `orderBySchema`), and the payloads and results of `kernel.messages.list` (with `messagesListLimits`) and `kernel.subscribers.list`.
