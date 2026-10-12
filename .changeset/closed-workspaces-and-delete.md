---
'@kvman/sdk': minor
'@kvman/kvwebui': minor
'@kvman/kvcoder': patch
---

A workspace whose folder is gone is closed at start. `kernel.workspace.closed.list` lists the closed workspaces, `kernel.workspace.delete` erases one for good after stopping its work, and the new point `kernel.workspace.deleted` tells extensions, in Home. The workspace picker has a "Closed workspaces" section with Reopen, Delete, and "Delete all missing"; kvcoder forgets a deleted workspace's background-process records (ADR 0061).
