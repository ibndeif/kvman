---
'@kvman/kvcoder': patch
---

`kvcoder.delegate.workers` refuses a program worker that starts at once (`approval: 'auto'`) and also approves its own actions: `opencode` with `autoApprove: true`, or `claude` with `permissionMode` `bypassPermissions`, `auto`, or `dontAsk` (ADR 0021, 39).
