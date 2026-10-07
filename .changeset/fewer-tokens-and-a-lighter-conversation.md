---
'@kvman/kvcoder': minor
---

Following ADR 0034, a chat uses fewer tokens and its page is lighter: `fs edit` returns the lines around what it changed, `fs read` says when a file is unchanged since an earlier read still in the chat, a connector command's JSON output has no indentation (the call card indents it for the person), `fs search` groups its matches by file, and the lead is told to brief a worker with what it already knows. A stored tool result keeps its output once. `kvcoder.message.list` takes `afterSeq`, so the conversation fetches only new messages; the new query `kvcoder.context.get` feeds a context line in the chat's header; a conversation that can't load says why and offers the export; and a summary's 10% minimum counts what is sent.
