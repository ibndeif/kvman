---
'@kvman/kvwebui': minor
---

The Extensions page's banner "Restart kvman to apply" has a "Restart now" button: it asks once, calls `kernel.restart`, shows "Restarting…", and reloads the page when kvman answers again. When `kernel.health.get` has `rolledBack`, the page says that the last change was undone and shows the Problem (ADR 0024, 9).
