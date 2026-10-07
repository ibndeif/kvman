---
'@kvman/kvcoder': patch
---

Following ADR 0035, the chat's header is one line with the time, the cost, and how full the model's memory is ("Memory 15% full"), and the token counts are in tooltips, on a turn's line too; a turn's totals come after the cards of its last calls; the line above a message's attached files is shown in the page's language; and a refused `fs edit` or `artifact edit` ends with `Nothing was written.`, so the model doesn't read the file again to check.
