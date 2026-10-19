---
'@kvman/kvcoder': patch
---

The approval card offers "Always allow" (a line's first two words, editable, or file changes), which saves the rule with `remember` on `kvcoder.question.answer`, and "Deny and say why…", whose `reason` the model reads as `denied by the user: <reason>` (ADR 0091, 3 and 4).
