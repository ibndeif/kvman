---
'@kvman/kvcoder': patch
---

Following ADR 0033, `kvcoder.message.list` has a 32 MiB output limit and returns the newest messages that fit in it, so a long chat no longer fails `TOO_LARGE` when it opens; and compaction measures the prompt by the provider's own token count (the last call's input, cached tokens, and output, plus what was added since) in place of the stored content's characters / 4, which summarized chats at less than half of `kvcoder.compactAt`.
