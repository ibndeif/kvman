---
'@kvman/kvcoder': patch
---

kvcoder declares indexes for the fields it filters its sessions, messages, turns, and other growing records by, so a chat's lookups no longer read every record of the workspace (ADR 0088, 3).
