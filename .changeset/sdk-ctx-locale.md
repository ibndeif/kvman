---
"@kvman/sdk": minor
---

`ctx.locale` and `ctx.i18n.t` (M2.11, 05 §5.4, ADR 0161): the language of the person who started the chain, and the extension's own catalogs in it (exact tag, base language, default locale) for text that leaves kvman; a missing key or parameter throws `VALIDATION_FAILED`.
