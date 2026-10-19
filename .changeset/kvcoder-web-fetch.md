---
'@kvman/kvcoder': patch
---

`web fetch { url }`: kvcoder's own connector `web` reads a page as Markdown (with `turndown`) or text, never from a private or local address, and asks before a chat's first page from each site (ADR 0095).
