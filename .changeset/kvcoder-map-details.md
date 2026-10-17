---
'@kvman/kvcoder': patch
---

The execution map is set as a skeleton, and `execution-map detail { id, details }` writes each step's details in Markdown, up to 4,000 characters, with Mermaid diagrams and charts, shown as Markdown in the step's dialog. A step's `description` is now `details`, and a stored description is read as details. Every map result lists the steps still `undetailed`, `doing` needs details, and `get {}` leaves the details out while `get { id }` reads one step whole (ADR 0086).
