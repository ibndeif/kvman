---
'@kvman/kvwebui': minor
---

A fenced `mermaid` block in Markdown is drawn as a diagram, wherever kvwebui shows Markdown. The `mermaid` package (12.1.0) is loaded only when a page shows such a block; it runs with `securityLevel: 'strict'` and no HTML labels, its SVG is sanitized, and a block that isn't a valid diagram stays as its source (ADR 0067).
