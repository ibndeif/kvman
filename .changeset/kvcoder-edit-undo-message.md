---
'@kvman/kvcoder': minor
---

Edit a message you typed, or undo the latest one, and the chat goes back to just before it: the message and everything after it are removed, with the changes kvman's `fs` made to files after it, its helpers' included, unless a file changed since (it is left and listed). A running turn is stopped first, helpers started after it are stopped, and artifacts and a map made after it are deleted. Every change now keeps its copy for the chat's life, `fs undo` keeps a record of its own, and a stopped step's late file change is refused. New: `kvcoder.rewind.files.list`, `kvcoder.message.edit`, `kvcoder.message.undo`, and `attachments` on `kvcoder.message.send` (ADR 0118).
